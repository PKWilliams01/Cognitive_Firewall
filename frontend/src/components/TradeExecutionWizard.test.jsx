import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import TradeExecutionWizard from './TradeExecutionWizard';
import { ToastProvider } from './Toast';

jest.mock('axios');

const user = (o = {}) => ({
  _id: 'u1',
  plannedDailyLimit: 3,
  strictConfluence: true,
  tradingPlanRules: [],
  ...o,
});
const firewall = (o = {}) => ({ isLocked: false, tradesRemaining: 2, dailyLimit: 3, maxRiskPercent: 5, revengeRisk: 10, ...o });

const renderWizard = (props = {}) =>
  render(
    <ToastProvider>
      <TradeExecutionWizard user={user()} firewall={firewall()} onClose={() => {}} onTradeSuccess={() => {}} {...props} />
    </ToastProvider>
  );

const chooseInstrument = (value = 'EUR/USD') =>
  fireEvent.change(screen.getByRole('combobox', { name: /instrument/i }), { target: { value } });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ token: 'jwt-token' }));
});

describe('pre-flight', () => {
  test('shows the firewall status the server reported', () => {
    renderWizard({ firewall: firewall({ tradesRemaining: 1, revengeRisk: 42, maxRiskPercent: 2 }) });
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('2%')).toBeInTheDocument();
  });

  test('clearance stays disabled until an instrument is chosen', () => {
    renderWizard();
    const btn = screen.getByRole('button', { name: /request clearance/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/choose an instrument/i)).toBeInTheDocument();
    chooseInstrument();
    expect(btn).toBeEnabled();
  });

  test('risk above the user cap is caught before asking the server', () => {
    renderWizard({ firewall: firewall({ maxRiskPercent: 2 }) });
    chooseInstrument();
    fireEvent.change(screen.getByLabelText(/risk percent/i), { target: { value: '3' } });
    expect(screen.getAllByText(/above your 2% cap/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /request clearance/i })).toBeDisabled();
  });

  test('hard rules must be ticked even when strict mode is off', () => {
    renderWizard({ user: user({ strictConfluence: false, tradingPlanRules: ['[HARD] Stop set before entry', 'HTF bias'] }) });
    chooseInstrument();
    const btn = screen.getByRole('button', { name: /request clearance/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/confirm 1 hard rule/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /stop set before entry/i }));
    expect(btn).toBeEnabled(); // soft rule is optional without strict mode
  });

  test('strict mode needs every rule — no "trade anyway" escape hatch', () => {
    renderWizard({ user: user({ tradingPlanRules: ['HTF bias', 'Session open'] }) });
    chooseInstrument();
    fireEvent.click(screen.getByRole('checkbox', { name: /htf bias/i }));
    expect(screen.getByRole('button', { name: /request clearance/i })).toBeDisabled();
    expect(screen.getByText('1/2 confirmed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /session open/i }));
    expect(screen.getByRole('button', { name: /request clearance/i })).toBeEnabled();
  });

  test('a locked firewall shows the reason instead of the form', () => {
    renderWizard({ firewall: firewall({ isLocked: true, lockReason: 'daily_limit', tradesRemaining: 0 }) });
    expect(screen.getByRole('alert')).toHaveTextContent(/daily limit reached/i);
    expect(screen.queryByRole('combobox', { name: /instrument/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request clearance/i })).toBeDisabled();
  });
});

describe('server clearance', () => {
  test('sends the full pre-flight to the server and opens the position', async () => {
    axios.post.mockResolvedValue({ data: { approved: true, warnings: [] } });
    renderWizard({ user: user({ tradingPlanRules: ['[HARD] Stop set', 'HTF bias'] }) });
    chooseInstrument('XAU/USD');
    fireEvent.click(screen.getByRole('radio', { name: /short/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /stop set/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /htf bias/i }));
    fireEvent.click(screen.getByRole('button', { name: /request clearance/i }));

    expect(await screen.findByRole('heading', { name: /position open/i })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/trades\/preflight$/),
      { instrument: 'XAU/USD', direction: 'sell', riskPercentage: 1, confluencesChecked: 2, confluencesTotal: 2, hardChecked: 1, hardTotal: 1 },
      expect.anything()
    );
  });

  test('a server lock (423) hands off to the cool-off screen', async () => {
    const onLocked = jest.fn();
    axios.post.mockRejectedValue({ response: { status: 423, data: { message: 'Hard Lock engaged — revenge risk 90%.' } } });
    renderWizard({ onLocked });
    chooseInstrument();
    fireEvent.click(screen.getByRole('button', { name: /request clearance/i }));

    await waitFor(() => expect(onLocked).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toHaveTextContent(/hard lock engaged/i);
  });
});

describe('live position and debrief', () => {
  async function openPosition() {
    axios.post.mockResolvedValueOnce({ data: { approved: true } });
    chooseInstrument();
    fireEvent.click(screen.getByRole('button', { name: /request clearance/i }));
    await screen.findByRole('heading', { name: /position open/i });
  }

  test('logs the debrief with honest defaults (plan not pre-claimed)', async () => {
    const onTradeSuccess = jest.fn();
    renderWizard({ onTradeSuccess });
    await openPosition();
    expect(screen.getByLabelText(/time in trade/i)).toHaveTextContent(/00:0\d/);

    fireEvent.click(screen.getByRole('button', { name: /close position/i }));
    expect(await screen.findByRole('heading', { name: /post-trade debrief/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /i followed my plan/i })).not.toBeChecked();

    axios.post.mockResolvedValueOnce({ data: {} });
    fireEvent.change(screen.getByLabelText(/profit or loss/i), { target: { value: '-120' } });
    fireEvent.click(screen.getByRole('radio', { name: /angry/i }));
    fireEvent.click(screen.getByRole('button', { name: /log trade/i }));

    await waitFor(() => expect(onTradeSuccess).toHaveBeenCalled());
    const [, body] = axios.post.mock.calls[1];
    expect(body).toMatchObject({ instrument: 'EUR/USD', pnl: -120, result: 'loss', mood: 'Angry', followedPlan: false });
  });

  test('leaving mid-trade asks for confirmation first', async () => {
    const onClose = jest.fn();
    renderWizard({ onClose });
    await openPosition();
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/leave without logging/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^leave$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('never uses browser alert()', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    renderWizard();
    await openPosition();
    fireEvent.click(screen.getByRole('button', { name: /close position/i }));
    fireEvent.click(await screen.findByRole('button', { name: /log trade/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the final p\/l/i);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
