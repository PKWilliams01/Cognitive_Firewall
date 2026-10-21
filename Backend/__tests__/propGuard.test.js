const request = require('supertest');
const mongoose = require('mongoose');
const propGuard = require('../Services/propGuard');
const { generateUserMetrics, nextDayStart } = require('../Services/metricsService');

const NOW = new Date('2026-10-21T12:00:00Z'); // 14:00 in Prague
const ftmo = (o = {}) => ({
  propGuardEnabled: true, propFirm: 'ftmo', propAccountSize: 100000, propDailyLossPercent: 5,
  propMaxLossPercent: 10, propMaxLossType: 'static', propBufferPercent: 1, propResetTimezone: 'Europe/Prague',
  propStartDate: new Date('2026-10-01T00:00:00Z'), plannedDailyLimit: 50, ...o,
});
const closed = (iso, pnl) => ({
  pnl, followedPlan: true, result: pnl > 0 ? 'win' : 'loss',
  entryTime: new Date(new Date(iso).getTime() - 600000), exitTime: new Date(iso),
});

describe('propGuard.evaluate', () => {
  test('disabled guard reports nothing', () => {
    expect(propGuard.evaluate({}, [], NOW)).toEqual({ enabled: false });
  });

  test('daily loss locks a buffer short of the real 5% limit', () => {
    const s = propGuard.evaluate(ftmo(), [closed('2026-10-21T09:00:00Z', -2500), closed('2026-10-21T10:00:00Z', -1600)], NOW);
    expect(s).toMatchObject({ dailyUsed: 4100, dailyLimit: 5000, buffer: 1000, lockReason: 'prop_daily' });
  });

  test("yesterday's losses (Prague time) don't count toward today", () => {
    // 21:30 UTC on the 20th is 23:30 in Prague — still the 20th there.
    const s = propGuard.evaluate(ftmo(), [closed('2026-10-20T21:30:00Z', -3900)], NOW);
    expect(s.dailyUsed).toBe(0);
    expect(s.lockReason).toBeNull();
    // ...but 22:30 UTC is 00:30 on the 21st in Prague.
    const t = propGuard.evaluate(ftmo(), [closed('2026-10-20T22:30:00Z', -3900)], NOW);
    expect(t.dailyUsed).toBe(3900);
  });

  test('static max loss uses the starting-balance floor', () => {
    const trades = [closed('2026-10-05T10:00:00Z', -4000), closed('2026-10-12T10:00:00Z', -3000), closed('2026-10-19T10:00:00Z', -2100)];
    const s = propGuard.evaluate(ftmo(), trades, NOW);
    expect(s).toMatchObject({ balance: 90900, floor: 90000, maxUsed: 9100, lockReason: 'prop_max' });
  });

  test('trailing max loss follows the high-water mark, capped at the start balance', () => {
    const trades = [closed('2026-10-05T10:00:00Z', 6000), closed('2026-10-12T10:00:00Z', -8000)];
    const s = propGuard.evaluate(ftmo({ propMaxLossType: 'trailing', propMaxLossPercent: 8 }), trades, NOW);
    // peak 106k → floor min(106k − 8k, 100k) = 98k; balance 98k → breached
    expect(s).toMatchObject({ floor: 98000, balance: 98000, lockReason: 'prop_max' });
  });

  test('trades before the challenge start are ignored', () => {
    const s = propGuard.evaluate(ftmo(), [closed('2026-09-15T10:00:00Z', -9500)], NOW);
    expect(s.balance).toBe(100000);
  });

  test('warns as the allowance is used up', () => {
    const s = propGuard.evaluate(ftmo(), [closed('2026-10-21T09:00:00Z', -3200)], NOW);
    expect(s.lockReason).toBeNull();
    expect(s.warnings[0]).toMatchObject({ code: 'prop_daily_near', severity: 'high' });
  });

  test('roomFor checks the worst case against the tighter of both limits', () => {
    const s = propGuard.evaluate(ftmo(), [closed('2026-10-21T09:00:00Z', -2000)], NOW);
    expect(s.dailyRoom).toBe(2000);
    expect(propGuard.roomFor(s, 1500).ok).toBe(true);
    expect(propGuard.roomFor(s, 2500)).toEqual({ ok: false, room: 2000 });
  });
});

describe('firewall integration', () => {
  test('prop lock outranks other locks and unlocks at the Prague reset', () => {
    const m = generateUserMetrics(ftmo(), [closed('2026-10-21T09:00:00Z', -4500)], NOW);
    expect(m).toMatchObject({ isLocked: true, lockReason: 'prop_daily' });
    expect(m.lockedUntil).toBe('2026-10-21T22:00:00.000Z'); // midnight CEST
    expect(m.propGuard.dailyUsed).toBe(4500);
  });

  test('nextDayStart handles DST', () => {
    // Prague leaves summer time on 25 Oct 2026: midnight on the 26th is 23:00 UTC.
    expect(nextDayStart(new Date('2026-10-25T12:00:00Z'), 'Europe/Prague').toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});

describe('API', () => {
  const app = require('../server');
  const Trade = require('../Models/Trade');
  beforeAll(async () => { await mongoose.connect('mongodb://127.0.0.1:27017/cognitive_firewall_test'); });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });

  async function setup() {
    const res = await request(app).post('/api/users/register')
      .send({ username: 'prop', email: `prop_${Date.now()}_${Math.random()}@test.local`, password: 'Passw0rd!' });
    const h = { Authorization: `Bearer ${res.body.token}` };
    await request(app).patch('/api/users/me').set(h).send({
      propGuardEnabled: true, propFirm: 'ftmo', propAccountSize: 100000, propStartDate: new Date(Date.now() - 864e5 * 10).toISOString(),
      plannedDailyLimit: 20, startingBalance: 100000,
    });
    return { h, id: res.body._id };
  }
  const loss = (userId, pnl, minsAgo) => Trade.create({
    userId, instrument: 'EUR/USD', direction: 'buy', pnl, result: 'loss', followedPlan: true, mood: 'Calm', riskPercentage: 1,
    entryTime: new Date(Date.now() - (minsAgo + 5) * 60000), exitTime: new Date(Date.now() - minsAgo * 60000),
  });

  test('pre-flight refuses a trade bigger than the remaining room', async () => {
    const { h, id } = await setup();
    await loss(id, -3000, 300);
    const res = await request(app).post('/api/trades/preflight').set(h).send({ riskPercentage: 1.5 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('prop_room');
    const ok = await request(app).post('/api/trades/preflight').set(h).send({ riskPercentage: 0.5 });
    expect(ok.status).toBe(200);
  });

  test("can't disable or widen the guard while it has you locked", async () => {
    const { h, id } = await setup();
    await loss(id, -4200, 300);
    expect((await request(app).post('/api/trades/preflight').set(h).send({ riskPercentage: 0.1 })).status).toBe(423);
    const off = await request(app).patch('/api/users/me').set(h).send({ propGuardEnabled: false });
    expect(off.status).toBe(423);
    expect((await request(app).patch('/api/users/me').set(h).send({ propDailyLossPercent: 8 })).status).toBe(423);
    expect((await request(app).patch('/api/users/me').set(h).send({ propBufferPercent: 2 })).status).toBe(200); // tightening is fine
  });

  test('after a max-loss breach, starting a new challenge is the only way out', async () => {
    const { h, id } = await setup();
    await loss(id, -9500, 60 * 30);
    const m = await request(app).get(`/api/trades/metrics/${id}`).set(h);
    expect(m.body.lockReason).toBe('prop_max');
    expect((await request(app).patch('/api/users/me').set(h).send({ propMaxLossPercent: 20 })).status).toBe(423);
    const fresh = await request(app).patch('/api/users/me').set(h).send({ propStartDate: new Date().toISOString() });
    expect(fresh.status).toBe(200);
    const after = await request(app).get(`/api/trades/metrics/${id}`).set(h);
    expect(after.body.propGuard.balance).toBe(100000);
  });
});
