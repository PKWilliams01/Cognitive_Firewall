import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { ToastProvider } from './Toast';
import PushSettings from './PushSettings';

jest.mock('axios');

const wrap = () => render(<ToastProvider><PushSettings /></ToastProvider>);
const fakeSub = { endpoint: 'https://push.example/1', toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: jest.fn(() => Promise.resolve(true)) };

function installPush({ permission = 'default', existing = null } = {}) {
  const pushManager = { getSubscription: jest.fn(() => Promise.resolve(existing)), subscribe: jest.fn(() => Promise.resolve(fakeSub)) };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: () => Promise.resolve({ pushManager }) } });
  window.PushManager = function PushManager() {};
  window.Notification = { permission, requestPermission: jest.fn(() => Promise.resolve('granted')) };
  return pushManager;
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', token: 't' }));
});
afterEach(() => {
  delete navigator.serviceWorker;
  delete window.PushManager;
  delete window.Notification;
});

test('says so when the browser has no push support', () => {
  wrap();
  expect(screen.getByText(/doesn't support push/)).toBeInTheDocument();
});

test('turning alerts on asks permission, subscribes with the server key, and registers the device', async () => {
  const pm = installPush();
  axios.get.mockResolvedValue({ data: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' } });
  axios.post.mockResolvedValue({ data: {} });
  wrap();
  fireEvent.click(await screen.findByRole('switch', { name: 'Alerts on this device' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
  expect(window.Notification.requestPermission).toHaveBeenCalled();
  expect(pm.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) }));
  expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/push\/subscribe$/);
  expect(await screen.findByRole('button', { name: /Send a test alert/ })).toBeInTheDocument();
});

test('turning alerts off removes the device', async () => {
  installPush({ permission: 'granted', existing: fakeSub });
  axios.delete.mockResolvedValue({ data: {} });
  wrap();
  const sw = await screen.findByRole('switch', { name: 'Alerts on this device' });
  await waitFor(() => expect(sw).toBeChecked());
  fireEvent.click(sw);
  await waitFor(() => expect(fakeSub.unsubscribe).toHaveBeenCalled());
  expect(axios.delete.mock.calls[0][1]).toMatchObject({ data: { endpoint: 'https://push.example/1' } });
});

test('explains blocked permission', async () => {
  installPush({ permission: 'denied' });
  wrap();
  expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Alerts on this device' })).toBeDisabled();
});
