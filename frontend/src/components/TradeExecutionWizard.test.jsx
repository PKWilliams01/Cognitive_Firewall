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

describe('server pre-flight', () => {
  const { ToastProvider } = require('./Toast');
  const { fireEvent: fe } = require('@testing-library/react');

  const renderWithToasts = (props = {}) =>
    render(
      <ToastProvider>
        <TradeExecutionWizard user={baseUser} userId="u1" revengeRisk={0} onClose={() => {}} onTradeSuccess={() => {}} {...props} />
      </ToastProvider>
    );


  test('asks the server to approve the trade before opening it', async () => {
    axios.post.mockResolvedValue({ data: { approved: true } });
    renderWithToasts();
    fe.change(screen.getAllByRole('combobox')[0], { target: { value: 'EUR/USD' } });
    fe.click(await screen.findByRole('button', { name: /initialize execution/i }));

    expect(await screen.findByRole('button', { name: /terminate position/i })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/trades\/preflight$/),
      expect.objectContaining({ instrument: 'EUR/USD', riskPercentage: 1, confluencesTotal: 0 }),
      expect.anything()
    );
  });

  test('a server lock (423) keeps the trader in pre-flight and explains why', async () => {
    axios.post.mockRejectedValue({ response: { status: 423, data: { message: 'Hard Lock engaged — revenge risk 90%.' } } });
    renderWithToasts();
    fe.change(screen.getAllByRole('combobox')[0], { target: { value: 'EUR/USD' } });
    fe.click(await screen.findByRole('button', { name: /initialize execution/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/hard lock engaged/i);
    expect(screen.queryByRole('button', { name: /terminate position/i })).not.toBeInTheDocument();
  });

  test('uses the server lock state when provided (custom threshold)', async () => {
    renderWithToasts({ firewall: { isLocked: true, lockReason: 'revenge', tradesRemaining: 2, dailyLimit: 3 }, revengeRisk: 65 });
    expect(await screen.findByText(/system locked: critical revenge risk/i)).toBeInTheDocument();
  });

  test('no browser alert() is used for validation', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    renderWithToasts();
    fe.click(await screen.findByRole('button', { name: /initialize execution/i }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/select an asset/i);
    alertSpy.mockRestore();
  });
});
