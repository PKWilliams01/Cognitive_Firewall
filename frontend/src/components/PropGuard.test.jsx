import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import Settings from './Settings';
import PropGuardPanel from './PropGuardPanel';
import CooldownScreen from './CooldownScreen';
import { ToastProvider } from './Toast';

jest.mock('axios');

const guard = (o = {}) => ({
  enabled: true, firmLabel: 'FTMO', accountSize: 100000, balance: 97500, todayPnl: -2500,
  dailyLimit: 5000, dailyUsed: 2500, dailyRoom: 1500, maxLimit: 10000, maxUsed: 2500, maxRoom: 6500,
  floor: 90000, buffer: 1000, maxLossType: 'static', resetTimezone: 'Europe/Prague', lockReason: null, ...o,
});

const profile = (o = {}) => ({
  _id: 'u1', username: 'Gee', email: 'g@example.com', authProvider: 'local', hasPassword: true,
  startingBalance: 1000, currency: 'USD', plannedDailyLimit: 3, maxRiskPercent: 5, lockThreshold: 80,
  cooldownMinutes: 0, strictConfluence: true, timezone: 'Europe/London', whyITrade: '',
  propGuardEnabled: false, propFirm: 'ftmo', propAccountSize: 100000, propDailyLossPercent: 5, propMaxLossPercent: 10,
  propMaxLossType: 'static', propBufferPercent: 1, propResetTimezone: 'Europe/Prague', propStartDate: null, ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', token: 't' }));
});

test('dashboard panel shows used allowance and room before the lock', () => {
  render(<PropGuardPanel guard={guard()} />);
  expect(screen.getByText('FTMO guard')).toBeInTheDocument();
  expect(screen.getByText('$1,500 room before the lock')).toBeInTheDocument();
  expect(screen.getByRole('meter', { name: 'Daily loss' })).toHaveAttribute('aria-valuenow', '2500');
  expect(screen.getByText(/floor \$90,000/)).toBeInTheDocument();
});

test('settings: enabling the guard reveals FTMO defaults and saves only what changed', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/api/brokers') ? { configured: false, connections: [] } : profile() }));
  axios.patch.mockImplementation((url, body) => Promise.resolve({ data: profile(body) }));
  render(<ToastProvider><Settings onUserUpdated={() => {}} onAccountDeleted={() => {}} /></ToastProvider>);

  fireEvent.click(await screen.findByRole('switch', { name: 'Protect a prop-firm account' }));
  expect(screen.getByText(/Locks after/)).toHaveTextContent('Locks after $4,000 lost in a day or $9,000 overall (static).');
  fireEvent.change(screen.getByLabelText(/Max daily loss/), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalled());
  expect(axios.patch.mock.calls[0][1]).toEqual({ propGuardEnabled: true, propDailyLossPercent: 4 });
});

test('cool-off screen explains a max-loss lock and shows no countdown', () => {
  render(
    <CooldownScreen
      firewall={{ isLocked: true, lockReason: 'prop_max', propGuard: guard({ balance: 90800, lockReason: 'prop_max' }) }}
      user={{}}
      onClose={() => {}}
      onCheckIn={() => {}}
    />
  );
  expect(screen.getByText('ACCOUNT GUARD ENGAGED')).toBeInTheDocument();
  expect(screen.getByText(/Balance \$90,800 is within \$1,000 of the FTMO max-loss floor \(\$90,000\)/)).toBeInTheDocument();
  expect(screen.queryByText(/Unlocks in|Resets at midnight/)).not.toBeInTheDocument();
});
