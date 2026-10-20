import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import Settings from './Settings';
import { ToastProvider } from './Toast';

jest.mock('axios');

const profile = (o = {}) => ({
  _id: 'u1', username: 'Gee Trader', email: 'gee@example.com', authProvider: 'local', hasPassword: true,
  startingBalance: 1000, currency: 'USD', plannedDailyLimit: 3, maxRiskPercent: 5, lockThreshold: 80,
  cooldownMinutes: 0, strictConfluence: true, timezone: 'Europe/London', whyITrade: '', ...o,
});

const renderSettings = (props = {}) =>
  render(<ToastProvider><Settings onUserUpdated={() => {}} onAccountDeleted={() => {}} {...props} /></ToastProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', token: 't' }));
  axios.get.mockResolvedValue({ data: profile() });
});

test('loads the current settings from the server', async () => {
  renderSettings();
  expect(await screen.findByDisplayValue('Gee Trader')).toBeInTheDocument();
  expect(screen.getByDisplayValue('gee@example.com')).toBeDisabled();
  expect(screen.getByLabelText(/hard lock threshold/i)).toHaveValue('80');
  expect(screen.getByRole('switch', { name: /strict confluence mode/i })).toBeChecked();
  expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/api\/users\/me$/), expect.anything());
});

test('the save bar only appears after a change, and saves just the changed fields', async () => {
  const onUserUpdated = jest.fn();
  axios.patch.mockResolvedValue({ data: profile({ lockThreshold: 70, maxRiskPercent: 2 }) });
  renderSettings({ onUserUpdated });
  await screen.findByDisplayValue('Gee Trader');

  expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/hard lock threshold/i), { target: { value: '70' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: /max risk per trade/i }), { target: { value: '2' } });

  expect(screen.getByText(/2 unsaved changes/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/users\/me$/),
    { lockThreshold: 70, maxRiskPercent: 2 },
    expect.anything()
  ));
  await waitFor(() => expect(onUserUpdated).toHaveBeenCalledWith(expect.objectContaining({ lockThreshold: 70 })));
  expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
});

test('discard reverts unsaved edits', async () => {
  renderSettings();
  const name = await screen.findByDisplayValue('Gee Trader');
  fireEvent.change(name, { target: { value: 'Someone Else' } });
  fireEvent.click(screen.getByRole('button', { name: /discard/i }));
  expect(screen.getByDisplayValue('Gee Trader')).toBeInTheDocument();
});

test('server validation errors are shown as a toast', async () => {
  axios.patch.mockRejectedValue({ response: { status: 422, data: { message: 'maxRiskPercent must be between 0.1 and 100' } } });
  renderSettings();
  await screen.findByDisplayValue('Gee Trader');
  fireEvent.change(screen.getByRole('spinbutton', { name: /max risk per trade/i }), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/maxRiskPercent must be between/i);
});

test('Google-only accounts are offered "Set a password" without a current-password field', async () => {
  axios.get.mockResolvedValue({ data: profile({ authProvider: 'google', hasPassword: false }) });
  renderSettings();
  expect(await screen.findByRole('heading', { name: /set a password/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
});

test('account deletion needs the word DELETE and the password', async () => {
  const onAccountDeleted = jest.fn();
  axios.delete.mockResolvedValue({ data: { message: 'Account deleted' } });
  renderSettings({ onAccountDeleted });
  await screen.findByDisplayValue('Gee Trader');

  fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));
  const confirmBtn = screen.getByRole('button', { name: /permanently delete/i });
  expect(confirmBtn).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/type delete to confirm/i), { target: { value: 'DELETE' } });
  expect(confirmBtn).toBeDisabled(); // still needs the password
  fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'Passw0rd!' } });
  expect(confirmBtn).toBeEnabled();

  fireEvent.click(confirmBtn);
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/users\/me$/),
    expect.objectContaining({ data: { confirm: 'DELETE', password: 'Passw0rd!' } })
  ));
  await waitFor(() => expect(onAccountDeleted).toHaveBeenCalled());
});
