import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import { ToastProvider } from './Toast';
import { ReflectiveJournal } from './ReflectiveJournal';
import StrategySettings from './StrategySettings';
import CooldownScreen, { formatRemaining } from './CooldownScreen';

jest.mock('axios');

const wrap = (ui) => render(<ToastProvider>{ui}</ToastProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', token: 't' }));
});

const trade = (o = {}) => ({
  _id: Math.random().toString(36).slice(2),
  instrument: 'EUR/USD',
  direction: 'buy',
  pnl: 100,
  followedPlan: true,
  mood: 'Calm',
  riskPercentage: 1,
  entryTime: new Date(Date.now() - 40 * 60000).toISOString(),
  exitTime: new Date(Date.now() - 10 * 60000).toISOString(),
  ...o,
});

/* ------------------------------ Journal ------------------------------ */

describe('Journal — trades', () => {
  const trades = [
    trade({ instrument: 'EUR/USD', pnl: 200 }),
    trade({ instrument: 'NAS100', pnl: -150, followedPlan: false, mood: 'Angry', notes: 'Revenge entry after the open' }),
    trade({ instrument: 'XAU/USD', pnl: -50, source: 'oanda' }),
  ];

  test('summarises adherence, win rate and net P/L', () => {
    wrap(<ReflectiveJournal trades={trades} userId="u1" onTradeLogged={() => {}} />);
    expect(screen.getByText('67%')).toBeInTheDocument(); // 2 of 3 followed plan
    expect(screen.getByText('33%')).toBeInTheDocument(); // 1 win of 3
    expect(screen.getByText('$0.00')).toBeInTheDocument(); // 200 - 150 - 50
  });

  test('filters losses and plan breaks, and searches notes', () => {
    wrap(<ReflectiveJournal trades={trades} userId="u1" onTradeLogged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^losses$/i }));
    expect(screen.queryByText('EUR/USD')).not.toBeInTheDocument();
    expect(screen.getByText('NAS100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /plan broken/i }));
    expect(screen.queryByText('XAU/USD')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    fireEvent.change(screen.getByLabelText(/search trades/i), { target: { value: 'revenge' } });
    expect(screen.getByText('NAS100')).toBeInTheDocument();
    expect(screen.queryByText('EUR/USD')).not.toBeInTheDocument();
  });

  test('shows hold time and labels imported broker trades', () => {
    wrap(<ReflectiveJournal trades={trades} userId="u1" onTradeLogged={() => {}} />);
    expect(screen.getAllByText(/30m/).length).toBeGreaterThan(0);
    expect(screen.getByText('OANDA')).toBeInTheDocument();
  });

  test('manual logging sends real entry/exit times and rejects exit before entry', async () => {
    const onTradeLogged = jest.fn();
    axios.post.mockResolvedValue({ data: {} });
    wrap(<ReflectiveJournal trades={[]} userId="u1" onTradeLogged={onTradeLogged} />);
    fireEvent.click(screen.getByRole('button', { name: /log past trade/i }));

    const form = screen.getByRole('form', { name: /log a past trade/i });
    const selects = form.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'GBP/USD' } });
    fireEvent.change(screen.getByPlaceholderText('-120 or 250'), { target: { value: '75' } });

    const [entry, exit] = form.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(entry, { target: { value: '2026-10-20T10:00' } });
    fireEvent.change(exit, { target: { value: '2026-10-20T09:00' } });
    expect(screen.getByText(/exit must be after entry/i)).toBeInTheDocument();

    fireEvent.change(exit, { target: { value: '2026-10-20T10:45' } });
    fireEvent.click(screen.getByRole('button', { name: /save to ledger/i }));

    await waitFor(() => expect(onTradeLogged).toHaveBeenCalled());
    const [, body] = axios.post.mock.calls[0];
    expect(body.instrument).toBe('GBP/USD');
    expect(new Date(body.exitTime) - new Date(body.entryTime)).toBe(45 * 60000);
    expect(body.followedPlan).toBe(false);
  });
});

describe('Journal — mood check-ins', () => {
  test('lists check-ins with the firewall snapshot and saves a new one', async () => {
    axios.get.mockResolvedValue({ data: [{ _id: 'j1', emotionalState: 'FRUSTRATED', confidenceLevel: 3, revengeRiskAtEntry: 85, timestamp: new Date().toISOString(), notes: 'Two losses before lunch' }] });
    axios.post.mockResolvedValue({ data: {} });
    wrap(<ReflectiveJournal trades={[]} userId="u1" onTradeLogged={() => {}} initialTab="checkins" />);

    expect(await screen.findByText(/two losses before lunch/i)).toBeInTheDocument();
    expect(screen.getByText('Risk 85%')).toBeInTheDocument();

    const save = screen.getByRole('button', { name: /save check-in/i });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /focused/i }));
    fireEvent.click(save);
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/journal$/),
      expect.objectContaining({ emotionalState: 'FOCUSED', confidenceLevel: 6, sessionType: 'PRE-MARKET' }),
      expect.anything()
    ));
  });
});

/* ------------------------------ Strategy ----------------------------- */

describe('Strategy', () => {
  const user = { _id: 'u1', plannedDailyLimit: 3, tradingPlanRules: ['[HARD] Stop set before entry', 'HTF bias'] };

  test('splits hard and soft rules and is read-only until edited', () => {
    wrap(<StrategySettings user={user} onUpdate={() => {}} />);
    expect(screen.getByRole('region', { name: /system-critical/i })).toHaveTextContent(/stop set before entry/i);
    expect(screen.getByRole('region', { name: /operational/i })).toHaveTextContent(/htf bias/i);
    expect(screen.queryByRole('button', { name: /remove rule/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /increase daily limit/i })).toBeDisabled();
  });

  test('editing, adding a hard rule and a template, then sealing saves the plan', async () => {
    const onUpdate = jest.fn();
    axios.patch.mockResolvedValue({ data: { ...user, tradingPlanRules: ['x'] } });
    wrap(<StrategySettings user={user} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /edit plan/i }));
    fireEvent.change(screen.getByLabelText(/new rule/i), { target: { value: 'Liquidity sweep first' } });
    fireEvent.click(screen.getByRole('radio', { name: /hard/i }));
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.click(screen.getByRole('button', { name: /minimum 2r reward-to-risk/i }));
    fireEvent.click(screen.getByRole('button', { name: /increase daily limit/i }));
    fireEvent.click(screen.getByRole('button', { name: /seal plan/i }));

    await waitFor(() => expect(axios.patch).toHaveBeenCalled());
    const [, body] = axios.patch.mock.calls[0];
    expect(body.plannedDailyLimit).toBe(4);
    expect(body.tradingPlanRules).toEqual([
      '[HARD] Stop set before entry', 'HTF bias', '[HARD] Liquidity sweep first', 'Minimum 2R reward-to-risk',
    ]);
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });

  test('a server refusal while locked is explained', async () => {
    axios.patch.mockRejectedValue({ response: { status: 423, data: { message: "The firewall is locked, so you can't loosen your trading rules right now." } } });
    wrap(<StrategySettings user={user} onUpdate={() => {}} firewallLocked />);
    fireEvent.click(screen.getByRole('button', { name: /edit plan/i }));
    expect(screen.getByRole('note')).toHaveTextContent(/firewall is locked/i);
    fireEvent.click(screen.getByRole('button', { name: /remove rule: htf bias/i }));
    fireEvent.click(screen.getByRole('button', { name: /seal plan/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't loosen your trading rules/i);
  });
});

/* ------------------------------ Cool-off ----------------------------- */

describe('Cool-off screen', () => {
  test('formats the countdown', () => {
    expect(formatRemaining(65_000)).toBe('01:05');
    expect(formatRemaining(3_725_000)).toBe('1:02:05');
    expect(formatRemaining(-5)).toBe('00:00');
  });

  test('revenge lock: shows the user\'s own "why I trade" note and a timed countdown', () => {
    const until = new Date(Date.now() + 10 * 60000).toISOString();
    wrap(<CooldownScreen firewall={{ lockReason: 'revenge', revengeRisk: 90, lockedUntil: until }} user={{ whyITrade: 'Freedom for my family.' }} onClose={() => {}} onCheckIn={() => {}} />);
    expect(screen.getByRole('heading', { name: /step away/i })).toBeInTheDocument();
    expect(screen.getByText(/freedom for my family/i)).toBeInTheDocument();
    expect(screen.getByText(/unlocks in/i)).toBeInTheDocument();
  });

  test('daily limit lock reads as a completed session', () => {
    wrap(<CooldownScreen firewall={{ lockReason: 'daily_limit', dailyLimit: 3 }} user={{}} onClose={() => {}} onCheckIn={() => {}} />);
    expect(screen.getByRole('heading', { name: /plan done for today/i })).toBeInTheDocument();
    expect(screen.getByText(/resets at midnight/i)).toBeInTheDocument();
  });

  test('asks the app to re-check once a timed cool-off expires', () => {
    jest.useFakeTimers();
    const onUnlock = jest.fn();
    const until = new Date(Date.now() + 2000).toISOString();
    wrap(<CooldownScreen firewall={{ lockReason: 'revenge', lockedUntil: until }} user={{}} onClose={() => {}} onCheckIn={() => {}} onUnlock={onUnlock} />);
    act(() => { jest.advanceTimersByTime(3000); });
    expect(onUnlock).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('"Log how I feel" and Escape are wired', () => {
    const onCheckIn = jest.fn();
    const onClose = jest.fn();
    wrap(<CooldownScreen firewall={{ lockReason: 'revenge' }} user={{}} onClose={onClose} onCheckIn={onCheckIn} />);
    fireEvent.click(screen.getByRole('button', { name: /log how i feel/i }));
    expect(onCheckIn).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
