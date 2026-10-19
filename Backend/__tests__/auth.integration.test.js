const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');

// Use a DEDICATED test database — never the dev/prod DB — so real data is
// never touched. It is dropped entirely in afterAll.
const TEST_URI = 'mongodb://127.0.0.1:27017/cognitive_firewall_test';

const newUser = (n) => ({
  username: `user_${n}_${Date.now()}`,
  email: `user_${n}_${Date.now()}@test.local`,
  password: 'TestPw123!',
});

const tradePayload = (overrides = {}) => ({
  instrument: 'EUR/USD',
  direction: 'buy',
  pnl: 100,
  result: 'win',
  followedPlan: true,
  mood: 'Calm',
  entryTime: new Date(),
  exitTime: new Date(),
  riskPercentage: 1,
  ...overrides,
});

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  // Clear all collections between tests for isolation
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

async function registerUser(n) {
  const res = await request(app).post('/api/users/register').send(newUser(n));
  return { token: res.body.token, id: res.body._id, status: res.status };
}

describe('Auth routes', () => {
  test('register returns 201 with a token', async () => {
    const res = await request(app).post('/api/users/register').send(newUser('reg'));
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.email).toBeTruthy();
    expect(res.body.password).toBeUndefined();
  });

  test('duplicate email is rejected with 400', async () => {
    const u = newUser('dup');
    await request(app).post('/api/users/register').send(u);
    const res = await request(app).post('/api/users/register').send(u);
    expect(res.status).toBe(400);
  });

  test('login succeeds with correct credentials and fails with wrong ones', async () => {
    const u = newUser('login');
    await request(app).post('/api/users/register').send(u);

    const ok = await request(app).post('/api/users/login').send({ email: u.email, password: u.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app).post('/api/users/login').send({ email: u.email, password: 'wrong' });
    expect(bad.status).toBe(401);
  });
});

describe('Protected routes require a valid token', () => {
  test('trades, journal and user-update reject requests with no token', async () => {
    const { id } = await registerUser('noauth');
    expect((await request(app).get(`/api/trades/user/${id}`)).status).toBe(401);
    expect((await request(app).get(`/api/trades/metrics/${id}`)).status).toBe(401);
    expect((await request(app).get(`/api/journal/user/${id}`)).status).toBe(401);
    expect((await request(app).put(`/api/users/${id}`).send({ plannedDailyLimit: 9 })).status).toBe(401);
  });

  test('an invalid token is rejected', async () => {
    const { id } = await registerUser('badtok');
    const res = await request(app).get(`/api/trades/user/${id}`).set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});

describe('IDOR protection — users cannot reach each other\'s data', () => {
  test('user A cannot read user B\'s trades or metrics by changing the URL id', async () => {
    const A = await registerUser('A');
    const B = await registerUser('B');

    // B records a trade
    const made = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${B.token}`)
      .send(tradePayload({ pnl: 500 }));
    expect(made.status).toBe(201);

    // A requests B's trades using B's id but A's token -> scoped to A (empty)
    const trades = await request(app)
      .get(`/api/trades/user/${B.id}`)
      .set('Authorization', `Bearer ${A.token}`);
    expect(trades.status).toBe(200);
    expect(trades.body).toHaveLength(0);

    // A requests B's metrics -> scoped to A (no trades)
    const metrics = await request(app)
      .get(`/api/trades/metrics/${B.id}`)
      .set('Authorization', `Bearer ${A.token}`);
    expect(metrics.status).toBe(200);
    expect(metrics.body.hasTrades).toBe(false);

    // Sanity: B can see B's own trade
    const bTrades = await request(app)
      .get(`/api/trades/user/${B.id}`)
      .set('Authorization', `Bearer ${B.token}`);
    expect(bTrades.body).toHaveLength(1);
  });

  test('POST /api/trades ignores a spoofed body userId', async () => {
    const A = await registerUser('spoofA');
    const B = await registerUser('spoofB');

    // A posts a trade but tries to attribute it to B
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${A.token}`)
      .send(tradePayload({ userId: B.id, pnl: 10 }));

    // The trade belongs to A, not B
    const aTrades = await request(app).get(`/api/trades/user/${A.id}`).set('Authorization', `Bearer ${A.token}`);
    const bTrades = await request(app).get(`/api/trades/user/${B.id}`).set('Authorization', `Bearer ${B.token}`);
    expect(aTrades.body).toHaveLength(1);
    expect(bTrades.body).toHaveLength(0);
  });
});

describe('User update authorization', () => {
  test('a user cannot update another user', async () => {
    const A = await registerUser('updA');
    const B = await registerUser('updB');
    const res = await request(app)
      .put(`/api/users/${B.id}`)
      .set('Authorization', `Bearer ${A.token}`)
      .send({ plannedDailyLimit: 9 });
    expect(res.status).toBe(403);
  });

  test('self-update whitelists fields and ignores email/password/username', async () => {
    const u = newUser('wl');
    const reg = await request(app).post('/api/users/register').send(u);
    const { _id: id, token } = reg.body;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plannedDailyLimit: 7, email: 'hacked@evil.com', password: 'pwned', username: 'HACKED' });

    expect(res.status).toBe(200);
    expect(res.body.plannedDailyLimit).toBe(7);
    expect(res.body.email).toBe(u.email); // unchanged
    expect(res.body.token).toBeTruthy();   // fresh token returned

    // The injected email did not take effect — login with the new email fails
    const loginHacked = await request(app).post('/api/users/login').send({ email: 'hacked@evil.com', password: 'pwned' });
    expect(loginHacked.status).toBe(401);
  });
});
