jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(() => ({ publicKey: 'PUB_KEY', privateKey: 'PRIV_KEY' })),
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(() => Promise.resolve()),
}));
const webpush = require('web-push');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../Models/User');
const PushSubscription = require('../Models/PushSubscription');
const push = require('../Services/push');

beforeAll(async () => { await mongoose.connect('mongodb://127.0.0.1:27017/cognitive_firewall_test'); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });
beforeEach(() => jest.clearAllMocks());

const sub = (n = 1) => ({ endpoint: `https://push.example.com/sub/${n}`, keys: { p256dh: 'p', auth: 'a' } });

async function signUp() {
  const res = await request(app).post('/api/users/register')
    .send({ username: 'pusher', email: `push_${Date.now()}_${Math.random()}@test.local`, password: 'Passw0rd!' });
  return { h: { Authorization: `Bearer ${res.body.token}` }, id: res.body._id };
}

test('serves a VAPID key, generated once and reused', async () => {
  const a = await request(app).get('/api/push/vapid-public-key');
  const b = await request(app).get('/api/push/vapid-public-key');
  expect(a.body.publicKey).toBe('PUB_KEY');
  expect(b.body.publicKey).toBe('PUB_KEY');
  expect(webpush.generateVAPIDKeys).toHaveBeenCalledTimes(1);
});

test('subscribe, test-send and unsubscribe', async () => {
  const u = await signUp();
  expect((await request(app).post('/api/push/test').set(u.h)).status).toBe(404);
  expect((await request(app).post('/api/push/subscribe').set(u.h).send({ subscription: { endpoint: 'http://insecure' } })).status).toBe(400);
  expect((await request(app).post('/api/push/subscribe').set(u.h).send({ subscription: sub(1) })).status).toBe(201);
  expect((await request(app).get('/api/push/devices').set(u.h)).body.count).toBe(1);

  const t = await request(app).post('/api/push/test').set(u.h);
  expect(t.body.sent).toBe(1);
  expect(JSON.parse(webpush.sendNotification.mock.calls[0][1]).title).toMatch(/alerts are on/);

  await request(app).delete('/api/push/subscribe').set(u.h).send({ endpoint: sub(1).endpoint });
  expect(await PushSubscription.countDocuments({ userId: u.id })).toBe(0);
});

test('expired subscriptions are pruned', async () => {
  const u = await signUp();
  await request(app).post('/api/push/subscribe').set(u.h).send({ subscription: sub(2) });
  webpush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
  await push.sendToUser(u.id, { title: 'x' });
  expect(await PushSubscription.countDocuments({ userId: u.id })).toBe(0);
});

describe('notifyTransitions', () => {
  const state = (o = {}) => ({ isLocked: false, revengeRisk: 0, warnings: [], ...o });
  let user;
  beforeEach(async () => {
    const u = await signUp();
    await request(app).post('/api/push/subscribe').set(u.h).send({ subscription: sub(Math.random()) });
    user = await User.findById(u.id);
    jest.clearAllMocks();
  });
  const titles = () => webpush.sendNotification.mock.calls.map(([, body]) => JSON.parse(body).title);

  test('alerts on the way up, once per level', async () => {
    await push.notifyTransitions(user, state({ revengeRisk: 55 }));
    await push.notifyTransitions(user, state({ revengeRisk: 60 }));   // same level: silent
    await push.notifyTransitions(user, state({ revengeRisk: 80 }));
    expect(titles()).toEqual(['Tilt rising: revenge risk 55%', 'Red alert: revenge risk 80%']);
  });

  test('stays quiet when risk falls, then says when the lock lifts', async () => {
    await push.notifyTransitions(user, state({ isLocked: true, lockReason: 'revenge', revengeRisk: 90 }));
    await push.notifyTransitions(user, state({ isLocked: true, lockReason: 'revenge', revengeRisk: 90 })); // same lock
    await push.notifyTransitions(user, state({ revengeRisk: 30 }));
    await push.notifyTransitions(user, state({ revengeRisk: 0 }));
    expect(titles()).toEqual(['Hard Lock engaged', 'Firewall reopened']);
  });

  test('a different lock (e.g. prop guard after revenge) alerts again', async () => {
    await push.notifyTransitions(user, state({ isLocked: true, lockReason: 'revenge' }));
    await push.notifyTransitions(user, state({ isLocked: true, lockReason: 'prop_daily', lockedUntil: '2026-11-09T23:00:00.000Z' }));
    expect(titles()).toEqual(['Hard Lock engaged', 'Daily loss guard engaged']);
  });

  test('prop-firm warnings count as a warning level', () => {
    expect(push.levelOf(state({ warnings: [{ code: 'prop_daily_near', severity: 'medium' }] }))).toBe('warn');
    expect(push.levelOf(state({ warnings: [{ code: 'prop_daily_near', severity: 'high' }] }))).toBe('high');
  });
});
