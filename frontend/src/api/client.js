import axios from 'axios';
import API_BASE from '../config';

// Single place that knows how to talk to the backend: base URL, the JWT
// header, and what to do when a session has expired.

export const AUTH_EXPIRED_EVENT = 'auth:expired';

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw && raw !== 'undefined' ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const getToken = () => getStoredUser()?.token || null;

const withAuth = (config = {}) => {
  const token = getToken();
  return token
    ? { ...config, headers: { ...(config.headers || {}), Authorization: `Bearer ${token}` } }
    : config;
};

const onError = (err) => {
  // A 401 on an authenticated call means the token is no longer valid.
  if (err?.response?.status === 401 && getToken()) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
  throw err;
};

const url = (path) => `${API_BASE}${path}`;

// Each call is wrapped so even a synchronous throw becomes a rejected promise.
const call = (fn) => Promise.resolve().then(fn).catch(onError);

export const api = {
  get: (path, config) => call(() => axios.get(url(path), withAuth(config))),
  delete: (path, config) => call(() => axios.delete(url(path), withAuth(config))),
  post: (path, body, config) => call(() => axios.post(url(path), body, withAuth(config))),
  put: (path, body, config) => call(() => axios.put(url(path), body, withAuth(config))),
  patch: (path, body, config) => call(() => axios.patch(url(path), body, withAuth(config))),
};

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message ||
  (err?.response ? fallback : 'Can’t reach the server. Check your connection and try again.');

export default api;
