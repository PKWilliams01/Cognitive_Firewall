const request = require('supertest');
const mongoose = require('mongoose');

process.env.BROKER_ENCRYPTION_KEY = 'integration-test-key';
const app = require('../server');
const Trade = require('../Models/Trade');
const BrokerConnection = require('../Models/BrokerConnection');
const alpaca = require('../Services/brokers/alpaca');

const TEST_URI = 'mongodb://127.0.0.1:27017/cognitive_firewall_test';

beforeAll(async () => { await mongoose.connect(TEST_URI); await Trade.syncIndexes(); });
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
afterEach(async () => {
  jest.restoreAllMocks();
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

let n = 0;
async function signUp() {
  n += 1;
  const res = await request(app).post('/api/users/register')
    .send({ username: `broker${n}`, email: `b${n}_${Date.now()}@test.local`, password: 'Passw0rd!' });
  return { token: res.body.token, id: res.body._id };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function lockOut(userId) {
  const base = Date.now() - 60 * 60 * 1000;
  const t = (off, dur, pnl, followedPlan) => ({
    userId, instrument: 'EUR/USD', direction: 'buy', pnl, followedPlan, mood: 'Angry',
    result: pnl > 0 ? 'win' : 'loss', riskPercentage: 1,
    entryTime: new Date(base + off * 60000), exitTime: new Date(base + (off + dur) * 60000),
  });
  await Trade.insertMany([t(0, 10, 100, true), t(12, 3, -100, false), t(17, 3, -100, false)]);
}

function mockAlpaca() {
  jest.spyOn(alpaca, 'verify').mockResolvedValue({ accountId: 'PA123', label: 'Alpaca PA123' });
  jest.spyOn(alpaca, 'fetchClosedTrades').mockResolvedValue([
    { externalId: 'f2', instrument: 'SPY', direction: 'buy', entryTime: new Date(Date.now() - 864e5 * 3), exitTime: new Date(Date.now() - 864e5 * 3 + 6e5), pnl: -4 },
  ]);
  const enforce = jest.spyOn(alpaca, 'enforceLock').mockResolvedValue({ type: 'suspend_trade', detail: 'ok' });
  const release = jest.spyOn(alpaca, 'releaseLock').mockResolvedValue({ type: 'resume_trade', detail: 'ok' });
  return { enforce, release };
}

const connect = (token) => request(app).post('/api/brokers').set(auth(token))
  .send({ broker: 'alpaca', environment: 'practice', credentials: { keyId: 'AKTESTKEY1234', secret: 'shh-very-secret' } });

describe('/api/brokers', () => {
  test('requires auth', async () => {
    expect((await request(app).get('/api/brokers')).status).toBe(401);
  });

  test('connects, encrypts and never returns credentials', async () => {
    mockAlpaca();
    const u = await signUp();
    const res = await connect(u.token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ broker: 'alpaca', accountId: 'PA123', keyHint: 'AKTE…1234', enforceLock: false });
    expect(JSON.stringify(res.body)).not.toMatch(/shh-very-secret|credentials/);
    const stored = await BrokerConnection.findOne({ userId: u.id }).lean();
    expect(JSON.stringify(stored)).not.toContain('shh-very-secret');

    expect((await connect(u.token)).status).toBe(409);
    const list = await request(app).get('/api/brokers').set(auth(u.token));
    expect(list.body.configured).toBe(true);
    expect(list.body.connections).toHaveLength(1);
  });

  test('rejects bad credentials', async () => {
    jest.spyOn(alpaca, 'verify').mockRejectedValue(Object.assign(new Error('x'), { response: { status: 401 } }));
    const u = await signUp();
    const res = await connect(u.token);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/rejected these credentials/);
  });

  test('sync imports trades for review, dedupes, and throttles', async () => {
    mockAlpaca();
    const u = await signUp();
    const { body: conn } = await connect(u.token);
    const first = await request(app).post(`/api/brokers/${conn._id}/sync`).set(auth(u.token));
    expect(first.body).toMatchObject({ added: 1, fetched: 1 });
    const trade = await Trade.findOne({ userId: u.id });
    expect(trade).toMatchObject({ source: 'alpaca', followedPlan: false, needsReview: true, result: 'loss' });

    const again = await request(app).post(`/api/brokers/${conn._id}/sync`).set(auth(u.token));
    expect(again.body.skipped).toBe(true);
    await BrokerConnection.updateOne({ _id: conn._id }, { lastSyncAt: new Date(Date.now() - 10 * 60000) });
    const third = await request(app).post(`/api/brokers/${conn._id}/sync`).set(auth(u.token));
    expect(third.body.added).toBe(0);
    expect(await Trade.countDocuments({ userId: u.id })).toBe(1);
  });

  test('lock is mirrored to the broker and released on reopen', async () => {
    const { enforce, release } = mockAlpaca();
    const u = await signUp();
    const { body: conn } = await connect(u.token);
    await request(app).patch(`/api/brokers/${conn._id}`).set(auth(u.token)).send({ enforceLock: true });
    expect(enforce).not.toHaveBeenCalled();

    await lockOut(u.id);
    await request(app).get(`/api/trades/metrics/${u.id}`).set(auth(u.token));
    await new Promise((r) => setTimeout(r, 200));
    expect(enforce).toHaveBeenCalledTimes(1);
    expect((await BrokerConnection.findById(conn._id)).lockActive).toBe(true);

    // Can't switch enforcement off or disconnect while locked
    expect((await request(app).patch(`/api/brokers/${conn._id}`).set(auth(u.token)).send({ enforceLock: false })).status).toBe(423);
    expect((await request(app).delete(`/api/brokers/${conn._id}`).set(auth(u.token))).status).toBe(423);

    await Trade.deleteMany({ userId: u.id });
    await request(app).get(`/api/trades/metrics/${u.id}`).set(auth(u.token));
    await new Promise((r) => setTimeout(r, 200));
    expect(release).toHaveBeenCalledTimes(1);
    expect((await BrokerConnection.findById(conn._id)).lockActive).toBe(false);
  });

  test("other users can't touch a connection", async () => {
    mockAlpaca();
    const a = await signUp();
    const b = await signUp();
    const { body: conn } = await connect(a.token);
    expect((await request(app).delete(`/api/brokers/${conn._id}`).set(auth(b.token))).status).toBe(404);
  });

  test('CSV import records trades and dedupes on re-upload', async () => {
    const u = await signUp();
    const csv = 'Ticket,Open Time,Type,Item,Close Time,Commission,Swap,Profit\n1,2024.05.21 10:00:00,buy,EURUSD,2024.05.21 10:30:00,0,0,12';
    const r1 = await request(app).post('/api/brokers/import/csv').set(auth(u.token)).send({ csv });
    expect(r1.body).toMatchObject({ parsed: 1, added: 1 });
    const r2 = await request(app).post('/api/brokers/import/csv').set(auth(u.token)).send({ csv });
    expect(r2.body).toMatchObject({ added: 0, duplicates: 1 });
  });

  test('account deletion removes connections', async () => {
    mockAlpaca();
    const u = await signUp();
    await connect(u.token);
    await request(app).delete('/api/users/me').set(auth(u.token)).send({ password: 'Passw0rd!', confirm: 'DELETE' });
    expect(await BrokerConnection.countDocuments({ userId: u.id })).toBe(0);
  });
});

describe('PATCH /api/trades/:id (review)', () => {
  test('annotates and clears needsReview', async () => {
    const u = await signUp();
    const tr = await Trade.create({ userId: u.id, source: 'alpaca', externalId: 'z', instrument: 'SPY', direction: 'buy',
      pnl: 5, result: 'win', followedPlan: false, needsReview: true, entryTime: new Date(), exitTime: new Date() });
    const res = await request(app).patch(`/api/trades/${tr._id}`).set(auth(u.token)).send({ followedPlan: true, mood: 'Calm', notes: 'clean' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ followedPlan: true, mood: 'Calm', needsReview: false });
  });

  test("can't whitewash a broken-plan trade while locked", async () => {
    const u = await signUp();
    await lockOut(u.id);
    const broken = await Trade.findOne({ userId: u.id, followedPlan: false });
    const res = await request(app).patch(`/api/trades/${broken._id}`).set(auth(u.token)).send({ followedPlan: true });
    expect(res.status).toBe(423);
  });
});
