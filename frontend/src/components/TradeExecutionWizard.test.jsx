import { render, screen } from '@testing-library/react';
import axios from 'axios';
import TradeExecutionWizard from './TradeExecutionWizard';

jest.mock('axios');

const baseUser = { _id: 'u1', plannedDailyLimit: 3, tradingPlanRules: [] };

const renderWizard = (props = {}) =>
  render(
    <TradeExecutionWizard
      user={baseUser}
      userId="u1"
      revengeRisk={0}
      onClose={() => {}}
      onTradeSuccess={() => {}}
      {...props}
    />
  );

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockResolvedValue({ data: [] }); // no trades today by default
  localStorage.setItem('user', JSON.stringify({ token: 'jwt-token' }));
});

test('allows execution when the trader is calm and under the daily limit', async () => {
  renderWizard({ revengeRisk: 0 });
  expect(await screen.findByRole('button', { name: /initialize execution/i })).toBeInTheDocument();
  expect(screen.queryByText(/system locked/i)).not.toBeInTheDocument();
});

test('hard-locks with CRITICAL REVENGE RISK when revenge risk reaches the threshold', async () => {
  renderWizard({ revengeRisk: 100 });
  expect(await screen.findByText(/system locked: critical revenge risk/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /initialize execution/i })).not.toBeInTheDocument();
});

test('revenge-risk lock does not trigger just below the threshold', async () => {
  renderWizard({ revengeRisk: 79 });
  expect(await screen.findByRole('button', { name: /initialize execution/i })).toBeInTheDocument();
});

test('hard-locks with DAILY LIMIT REACHED once today\'s trades hit the limit', async () => {
  const today = new Date().toISOString();
  axios.get.mockResolvedValue({ data: [{ entryTime: today }, { entryTime: today }, { entryTime: today }] });
  renderWizard({ revengeRisk: 0 });
  expect(await screen.findByText(/system locked: daily limit reached/i)).toBeInTheDocument();
});
