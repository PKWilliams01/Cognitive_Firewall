const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../Models/User');
const Trade = require('../Models/Trade');

const TEST_URI = 'mongodb://127.0.0.1:27017/cognitive_firewall_test';

beforeAll(async () => { await mongoose.connect(TEST_URI); });
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

let n = 0;
async function signUp(overrides = {}) {
  n += 1;
  const body = { username: `trader${n}`, email: `t${n}_${Date.now()}@test.local`, password: 'Passw0rd!', ...overrides };
  const res = await request(app).post('/api/users/register').send(body);
  return { token: res.body.token, id: res.body._id, email: body.email, password: body.password };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const tradeBody = (o = {}) => ({
  instrument: 'EUR/USD', direction: 'buy', pnl: 50, result: 'win', followedPlan: true,
  mood: 'Calm', riskPercentage: 1, entryTime: new Date(), exitTime: new Date(), ...o,
});

// Put a user straight into a revenge lock: one win, then two rapid plan-broken losses.
async function lockOut(userId) {
  const base = Date.now() - 60 * 60 * 1000;
  const t = (offMin, durMin, pnl, followedPlan) => ({
    userId, instrument: 'EUR/USD', direction: 'buy', pnl, followedPlan, mood: 'Angry',
    result: pnl > 0 ? 'win' : 'loss', riskPercentage: 1,
    entryTime: new Date(base + offMin * 60000), exitTime: new Date(base + (offMin + durMin) * 60000),
  });
  await Trade.insertMany([t(0, 10, 100, true), t(12, 3, -100, false), t(17, 3, -100, false)]);
}

describe('GET/PATCH /api/users/me', () => {
  test('returns the profile with default risk settings and no secrets', async () => {
    const u = await signUp();
    const res = await request(app).get('/api/users/me').set(auth(u.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ startingBalance: 1000, maxRiskPercent: 5, lockThreshold: 80, cooldownMinutes: 0, strictConfluence: true, hasPassword: true });
    expect(res.body.password).toBeUndefined();
  });

  test('updates whitelisted settings and ignores everything else', async () => {
    const u = await signUp();
    const res = await request(app).patch('/api/users/me').set(auth(u.token)).send({
      startingBalance: 25000, maxRiskPercent: 2, lockThreshold: 70, cooldownMinutes: 60,
      timezone: 'Europe/London', whyITrade: 'Freedom, not gambling.', email: 'hacker@evil.com', password: 'x',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ startingBalance: 25000, maxRiskPercent: 2, lockThreshold: 70, cooldownMinutes: 60, timezone: 'Europe/London' });
    expect(res.body.email).toBe(u.email);
  });

  test.each([
    [{ maxRiskPercent: 0 }, 'maxRiskPercent'],
    [{ lockThreshold: 30 }, 'lockThreshold'],
    [{ plannedDailyLimit: 2.5 }, 'plannedDailyLimit'],
    [{ timezone: 'Mars/Olympus' }, 'timezone'],
    [{ startingBalance: -5 }, 'startingBalance'],
  ])('rejects invalid input %j', async (body, field) => {
    const u = await signUp();
    const res = await request(app).patch('/api/users/me').set(auth(u.token)).send(body);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(field);
  });

  test('requires authentication', async () => {
    expect((await request(app).get('/api/users/me')).status).toBe(401);
    expect((await request(app).patch('/api/users/me').send({ lockThreshold: 60 })).status).toBe(401);
  });
});

describe('passwords, export and deletion', () => {
  test('changing password requires the current one', async () => {
    const u = await signUp();
    const bad = await request(app).post('/api/users/me/password').set(auth(u.token)).send({ currentPassword: 'nope', newPassword: 'NewPassw0rd!' });
    expect(bad.status).toBe(401);
    const ok = await request(app).post('/api/users/me/password').set(auth(u.token)).send({ currentPassword: u.password, newPassword: 'NewPassw0rd!' });
    expect(ok.status).toBe(200);
    const login = await request(app).post('/api/users/login').send({ email: u.email, password: 'NewPassw0rd!' });
    expect(login.status).toBe(200);
  });

  test('a Google-only account can set its first password', async () => {
    const user = await User.create({ username: 'G', email: 'g@test.local', authProvider: 'google', googleId: 'sub-1' });
    const token = require('jsonwebtoken').sign({ id: user._id }, process.env.JWT_SECRET || 'cognitive_firewall_super_secret_key_2026');
    const res = await request(app).post('/api/users/me/password').set(auth(token)).send({ newPassword: 'FirstPass1!' });
    expect(res.status).toBe(200);
    expect((await request(app).post('/api/users/login').send({ email: 'g@test.local', password: 'FirstPass1!' })).status).toBe(200);
  });

  test('export returns the user\'s own trades only, as a download', async () => {
    const a = await signUp();
    const b = await signUp();
    await request(app).post('/api/trades').set(auth(a.token)).send(tradeBody());
    await request(app).post('/api/trades').set(auth(b.token)).send(tradeBody());
    const res = await request(app).get('/api/users/me/export').set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.trades).toHaveLength(1);
    expect(res.body.profile.email).toBe(a.email);
    expect(res.body.profile.password).toBeUndefined();
  });

  test('delete requires DELETE + password and removes all data', async () => {
    const u = await signUp();
    await request(app).post('/api/trades').set(auth(u.token)).send(tradeBody());
    expect((await request(app).delete('/api/users/me').set(auth(u.token)).send({ confirm: 'nope', password: u.password })).status).toBe(422);
    expect((await request(app).delete('/api/users/me').set(auth(u.token)).send({ confirm: 'DELETE', password: 'wrong' })).status).toBe(401);
    const ok = await request(app).delete('/api/users/me').set(auth(u.token)).send({ confirm: 'DELETE', password: u.password });
    expect(ok.status).toBe(200);
    expect(await User.countDocuments({ email: u.email })).toBe(0);
    expect(await Trade.countDocuments({ userId: u.id })).toBe(0);
  });
});

describe('server-side firewall enforcement', () => {
  test('pre-flight approves a compliant trade', async () => {
    const u = await signUp();
    const res = await request(app).post('/api/trades/preflight').set(auth(u.token)).send({ riskPercentage: 1, confluencesChecked: 0, confluencesTotal: 0 });
    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
  });

  test('pre-flight rejects risk above the user cap', async () => {
    const u = await signUp();
    await request(app).patch('/api/users/me').set(auth(u.token)).send({ maxRiskPercent: 2 });
    const res = await request(app).post('/api/trades/preflight').set(auth(u.token)).send({ riskPercentage: 2.5 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('risk_cap');
  });

  test('strict mode refuses missing confluences; relaxed mode allows them', async () => {
    const u = await signUp();
    const body = { riskPercentage: 1, confluencesChecked: 2, confluencesTotal: 4 };
    expect((await request(app).post('/api/trades/preflight').set(auth(u.token)).send(body)).body.code).toBe('confluences');
    await request(app).patch('/api/users/me').set(auth(u.token)).send({ strictConfluence: false });
    expect((await request(app).post('/api/trades/preflight').set(auth(u.token)).send(body)).status).toBe(200);
  });

  test('locked users are refused at pre-flight AND when logging (block everything)', async () => {
    const u = await signUp();
    await request(app).patch('/api/users/me').set(auth(u.token)).send({ plannedDailyLimit: 10 });
    await lockOut(u.id);

    const pre = await request(app).post('/api/trades/preflight').set(auth(u.token)).send({ riskPercentage: 1 });
    expect(pre.status).toBe(423);
    expect(pre.body.lockReason).toBe('revenge');

    const log = await request(app).post('/api/trades').set(auth(u.token)).send(tradeBody());
    expect(log.status).toBe(423);
    expect(await Trade.countDocuments({ userId: u.id })).toBe(3);
  });

  test('the daily limit is enforced on the server', async () => {
    const u = await signUp();
    await request(app).patch('/api/users/me').set(auth(u.token)).send({ plannedDailyLimit: 1 });
    expect((await request(app).post('/api/trades').set(auth(u.token)).send(tradeBody())).status).toBe(201);
    const second = await request(app).post('/api/trades').set(auth(u.token)).send(tradeBody());
    expect(second.status).toBe(423);
    expect(second.body.lockReason).toBe('daily_limit');
  });

  test('logging rejects risk above the cap even without a pre-flight', async () => {
    const u = await signUp();
    const res = await request(app).post('/api/trades').set(auth(u.token)).send(tradeBody({ riskPercentage: 50 }));
    expect(res.status).toBe(422);
  });

  test('metrics expose the authoritative lock state', async () => {
    const u = await signUp();
    await lockOut(u.id);
    const res = await request(app).get(`/api/trades/metrics/${u.id}`).set(auth(u.token));
    expect(res.body).toMatchObject({ isLocked: true, lockReason: 'revenge', revengeRisk: 100 });
  });
});

describe('legacy /api/metrics route', () => {
  test('is no longer readable without a token', async () => {
    const u = await signUp();
    expect((await request(app).get(`/api/metrics/${u.id}`)).status).toBe(401);
  });

  test('is scoped to the caller, not the URL id', async () => {
    const a = await signUp();
    const b = await signUp();
    await lockOut(b.id);
    const res = await request(app).get(`/api/metrics/${b.id}`).set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.body.hasTrades).toBe(false);
  });
});

describe('hard rules', () => {
  test('a [HARD] rule must be confirmed even with strict mode off', async () => {
    const u = await signUp();
    await request(app).patch('/api/users/me').set(auth(u.token)).send({ strictConfluence: false });
    const res = await request(app).post('/api/trades/preflight').set(auth(u.token))
      .send({ riskPercentage: 1, confluencesChecked: 2, confluencesTotal: 3, hardChecked: 0, hardTotal: 1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('hard_rules');
    const ok = await request(app).post('/api/trades/preflight').set(auth(u.token))
      .send({ riskPercentage: 1, confluencesChecked: 2, confluencesTotal: 3, hardChecked: 1, hardTotal: 1 });
    expect(ok.status).toBe(200);
  });
});

describe('mood check-ins (journal)', () => {
  test('server snapshots the current firewall state into each check-in', async () => {
    const u = await signUp();
    await request(app).patch('/api/users/me').set(auth(u.token)).send({ plannedDailyLimit: 10 });
    await lockOut(u.id);
    const res = await request(app).post('/api/journal').set(auth(u.token))
      .send({ emotionalState: 'FRUSTRATED', confidenceLevel: 3, notes: 'Chased two losses.', disciplineScoreAtEntry: 100, revengeRiskAtEntry: 0 });
    expect(res.status).toBe(201);
    expect(res.body.revengeRiskAtEntry).toBe(100); // client-supplied 0 ignored
    expect(res.body.disciplineScoreAtEntry).toBe(33);
  });

  test('check-ins are private, newest first, and deletable only by their owner', async () => {
    const a = await signUp();
    const b = await signUp();
    const first = await request(app).post('/api/journal').set(auth(a.token)).send({ emotionalState: 'CALM', confidenceLevel: 7 });
    await new Promise((r) => setTimeout(r, 5));
    await request(app).post('/api/journal').set(auth(a.token)).send({ emotionalState: 'FOCUSED', confidenceLevel: 8 });

    const list = await request(app).get(`/api/journal/user/${a.id}`).set(auth(a.token));
    expect(list.body.map((e) => e.emotionalState)).toEqual(['FOCUSED', 'CALM']);
    expect((await request(app).get(`/api/journal/user/${a.id}`).set(auth(b.token))).body).toHaveLength(0);

    expect((await request(app).delete(`/api/journal/${first.body._id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).delete(`/api/journal/${first.body._id}`).set(auth(a.token))).status).toBe(200);
  });

  test('invalid emotional states are rejected', async () => {
    const u = await signUp();
    const res = await request(app).post('/api/journal').set(auth(u.token)).send({ emotionalState: 'EUPHORIC', confidenceLevel: 5 });
    expect(res.status).toBe(400);
  });
});

describe('no loosening the rules mid-tilt', () => {
  async function lockedUser() {
    const u = await signUp();
    await request(app).patch('/api/users/me').set(auth(u.token)).send({ plannedDailyLimit: 10, timezone: 'Europe/London', tradingPlanRules: ['[HARD] Stop set before entry', 'Higher-timeframe bias'] });
    await lockOut(u.id);
    return u;
  }

  test.each([
    [{ lockThreshold: 100 }, 'lock threshold'],
    [{ plannedDailyLimit: 20 }, 'daily limit'],
    [{ maxRiskPercent: 10 }, 'risk cap'],
    [{ cooldownMinutes: 15 }, 'cool-off'],
    [{ strictConfluence: false }, 'strict mode'],
    [{ timezone: 'Asia/Tokyo' }, 'timezone'],
    [{ tradingPlanRules: ['Higher-timeframe bias'] }, 'trading rules'],
  ])('refuses %j while locked', async (body, label) => {
    const u = await lockedUser();
    const res = await request(app).patch('/api/users/me').set(auth(u.token)).send(body);
    expect(res.status).toBe(423);
    expect(res.body.message).toMatch(label);
  });

  test('tightening is still allowed while locked', async () => {
    const u = await lockedUser();
    const res = await request(app).patch('/api/users/me').set(auth(u.token)).send({
      lockThreshold: 60, plannedDailyLimit: 5, maxRiskPercent: 1,
      tradingPlanRules: ['[HARD] Stop set before entry', 'Higher-timeframe bias', 'No trading 15 min after a loss'],
    });
    expect(res.status).toBe(200);
  });

  test('the legacy PUT route is guarded too', async () => {
    const u = await lockedUser();
    const res = await request(app).put(`/api/users/${u.id}`).set(auth(u.token)).send({ plannedDailyLimit: 50 });
    expect(res.status).toBe(423);
  });

  test('loosening is fine when not locked', async () => {
    const u = await signUp();
    expect((await request(app).patch('/api/users/me').set(auth(u.token)).send({ lockThreshold: 95 })).status).toBe(200);
  });
});
