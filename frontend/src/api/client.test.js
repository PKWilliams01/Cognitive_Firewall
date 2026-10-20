import axios from 'axios';
import api, { AUTH_EXPIRED_EVENT, errorMessage } from './client';

jest.mock('axios');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

test('attaches the stored JWT and prefixes the API base URL', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', token: 'jwt-123' }));
  axios.get.mockResolvedValue({ data: [] });

  await api.get('/api/trades/user/u1');

  expect(axios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/trades\/user\/u1$/),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt-123' }) })
  );
});

test('sends no Authorization header when signed out', async () => {
  axios.post.mockResolvedValue({ data: {} });
  await api.post('/api/users/login', { email: 'a@b.com' });
  const config = axios.post.mock.calls[0][2];
  expect(config?.headers?.Authorization).toBeUndefined();
});

test('a 401 on an authenticated call announces that the session expired', async () => {
  localStorage.setItem('user', JSON.stringify({ token: 'stale' }));
  axios.get.mockRejectedValue({ response: { status: 401, data: { message: 'Not authorized' } } });
  const listener = jest.fn();
  window.addEventListener(AUTH_EXPIRED_EVENT, listener);

  await expect(api.get('/api/trades/metrics/u1')).rejects.toBeTruthy();
  expect(listener).toHaveBeenCalledTimes(1);
  window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
});

test('a 401 while signed out (e.g. wrong password) does not fire session expiry', async () => {
  axios.post.mockRejectedValue({ response: { status: 401 } });
  const listener = jest.fn();
  window.addEventListener(AUTH_EXPIRED_EVENT, listener);
  await expect(api.post('/api/users/login', {})).rejects.toBeTruthy();
  expect(listener).not.toHaveBeenCalled();
  window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
});

test('errorMessage prefers the server message and explains network failures', () => {
  expect(errorMessage({ response: { data: { message: 'Risk 9% exceeds your 5% cap.' } } })).toBe('Risk 9% exceeds your 5% cap.');
  expect(errorMessage({ response: { status: 500 } }, 'Fallback')).toBe('Fallback');
  expect(errorMessage(new Error('Network Error'))).toMatch(/can’t reach the server/i);
});
