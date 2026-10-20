const request = require('supertest');
const mongoose = require('mongoose');

// Mock Google's verifier so tests never call Google
jest.mock('google-auth-library', () => {
  const verifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn(() => ({ verifyIdToken })),
    __verifyIdToken: verifyIdToken,
  };
});
const { __verifyIdToken: verifyIdToken } = require('google-auth-library');

const app = require('../server');
const User = require('../Models/User');

const TEST_URI = 'mongodb://127.0.0.1:27017/cognitive_firewall_test';

const googlePayload = (overrides = {}) => ({
  sub: 'google-sub-123',
  email: 'trader@gmail.com',
  email_verified: true,
  name: 'Gee Trader',
  picture: 'https://example.com/avatar.png',
  ...overrides,
});

const mockVerified = (payload) =>
  verifyIdToken.mockResolvedValue({ getPayload: () => payload });

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  verifyIdToken.mockReset();
});

afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

describe('POST /api/users/google', () => {
  test('returns 503 when Google sign-in is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request(app).post('/api/users/google').send({ credential: 'x' });
    expect(res.status).toBe(503);
  });

  test('returns 400 when no credential is sent', async () => {
    const res = await request(app).post('/api/users/google').send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 when Google rejects the token', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad token'));
    const res = await request(app).post('/api/users/google').send({ credential: 'forged' });
    expect(res.status).toBe(401);
  });

  test('returns 401 when the Google email is not verified', async () => {
    mockVerified(googlePayload({ email_verified: false }));
    const res = await request(app).post('/api/users/google').send({ credential: 'tok' });
    expect(res.status).toBe(401);
  });

  test('creates a new account on first sign-in and issues a working JWT', async () => {
    mockVerified(googlePayload());
    const res = await request(app).post('/api/users/google').send({ credential: 'tok' });

    expect(res.status).toBe(201);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.email).toBe('trader@gmail.com');
    expect(res.body.password).toBeUndefined();
    // verified against our configured client id
    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: 'tok', audience: 'test-client-id.apps.googleusercontent.com' })
    );

    // The issued token works on a protected route
    const trades = await request(app)
      .get(`/api/trades/user/${res.body._id}`)
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(trades.status).toBe(200);
  });

  test('signs in an existing Google user without creating a duplicate', async () => {
    mockVerified(googlePayload());
    await request(app).post('/api/users/google').send({ credential: 'tok' });
    const again = await request(app).post('/api/users/google').send({ credential: 'tok' });

    expect(again.status).toBe(200);
    expect(again.body.isNewUser).toBeUndefined();
    expect(await User.countDocuments({ email: 'trader@gmail.com' })).toBe(1);
  });

  test('links Google to an existing email/password account', async () => {
    await request(app)
      .post('/api/users/register')
      .send({ username: 'local', email: 'trader@gmail.com', password: 'Pw12345!' });

    mockVerified(googlePayload());
    const res = await request(app).post('/api/users/google').send({ credential: 'tok' });

    expect(res.status).toBe(200);
    const user = await User.findOne({ email: 'trader@gmail.com' });
    expect(user.googleId).toBe('google-sub-123');
    expect(user.password).toBeTruthy(); // password login still works
  });

  test('password login on a Google-only account gives a helpful error', async () => {
    mockVerified(googlePayload());
    await request(app).post('/api/users/google').send({ credential: 'tok' });

    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'trader@gmail.com', password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/google/i);
  });
});
