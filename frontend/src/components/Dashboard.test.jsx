import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from './Dashboard';

// recharts' ResponsiveContainer measures 0×0 in jsdom; give it a fixed box.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: 600, height: 280 }}>
        {require('react').cloneElement(children, { width: 600, height: 280 })}
      </div>
    ),
  };
});

const user = { _id: 'u1', username: 'Gee Trader' };

const trade = (overrides = {}) => ({
  _id: Math.random().toString(36).slice(2),
  instrument: 'EUR/USD',
  direction: 'buy',
  pnl: 120,
  followedPlan: true,
  mood: 'Calm',
  entryTime: new Date().toISOString(),
  ...overrides,
});

const metrics = (overrides = {}) => ({
  hasTrades: true,
  disciplineScore: 80,
  revengeRisk: 10,
  impulsivityIndex: '0.67',
  dispositionRatio: '0.80',
  systemIntegrity: 85,
  netPnl: 240,
  winRate: 67,
  chartData: [{ name: 'Trade 1', growth: 12 }, { name: 'Trade 2', growth: 24 }],
  ...overrides,
});

test('greets the user by first name and shows the composed state when risk is low', () => {
  render(<Dashboard user={user} metrics={metrics()} trades={[trade(), trade(), trade()]} onExecute={() => {}} />);
  expect(screen.getByRole('heading', { name: /, gee$/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /composed and in control/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /start pre-flight/i })).toBeInTheDocument();
});

test('renders every KPI with its final value', () => {
  render(<Dashboard user={user} metrics={metrics()} trades={[trade()]} onExecute={() => {}} />);
  expect(screen.getByLabelText('Discipline 80%')).toBeInTheDocument();
  expect(screen.getByLabelText('Impulsivity 0.67×')).toBeInTheDocument();
  expect(screen.getByLabelText('Disposition 0.80')).toBeInTheDocument();
  expect(screen.getByLabelText('Net P/L +$240.00')).toBeInTheDocument();
  expect(screen.getByLabelText('Win rate 67%')).toBeInTheDocument();
});

test('shows the Hard Lock state at or above the lock threshold', () => {
  render(<Dashboard user={user} metrics={metrics({ revengeRisk: 88 })} trades={[trade()]} onExecute={() => {}} />);
  expect(screen.getByRole('heading', { name: /hard lock engaged/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view lock status/i })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /revenge risk 88 percent, locks at 80 percent/i })).toBeInTheDocument();
});

test('warns about rising tilt between 50% and the lock threshold', () => {
  render(<Dashboard user={user} metrics={metrics({ revengeRisk: 60 })} trades={[trade()]} onExecute={() => {}} />);
  expect(screen.getByRole('heading', { name: /tilt risk rising/i })).toBeInTheDocument();
});

test('the insight engine text is shown (e.g. leaked capital from impulsive trades)', () => {
  const trades = [
    trade({ followedPlan: true, pnl: 100 }),
    trade({ followedPlan: true, pnl: 50 }),
    trade({ followedPlan: false, pnl: -75 }),
  ];
  render(<Dashboard user={user} metrics={metrics()} trades={trades} onExecute={() => {}} />);
  expect(screen.getByText(/leaked \$75\.00/i)).toBeInTheDocument();
});

test('recent activity lists trades with plan adherence', () => {
  render(
    <Dashboard
      user={user}
      metrics={metrics()}
      trades={[trade({ instrument: 'XAU/USD', followedPlan: false, pnl: -40 })]}
      onExecute={() => {}}
    />
  );
  expect(screen.getByText('XAU/USD')).toBeInTheDocument();
  expect(screen.getByText(/plan broken/i)).toBeInTheDocument();
  expect(screen.getByText('−$40.00')).toBeInTheDocument();
});

test('new users see an empty state whose CTA starts a pre-flight', () => {
  const onExecute = jest.fn();
  render(<Dashboard user={user} metrics={{ hasTrades: false }} trades={[]} onExecute={onExecute} />);
  expect(screen.getByRole('heading', { name: /no trades logged yet/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /run your first pre-flight/i }));
  expect(onExecute).toHaveBeenCalledTimes(1);
});

test('renders safely before metrics have loaded', () => {
  render(<Dashboard user={user} metrics={null} trades={[]} onExecute={() => {}} />);
  expect(screen.getByRole('heading', { name: /composed and in control/i })).toBeInTheDocument();
});

describe('server firewall state', () => {
  test('shows "Daily limit reached" for a daily-limit lock', () => {
    render(<Dashboard user={user} metrics={metrics({ isLocked: true, lockReason: 'daily_limit', dailyLimit: 3, revengeRisk: 20 })} trades={[trade()]} onExecute={() => {}} />);
    expect(screen.getByRole('heading', { name: /daily limit reached/i })).toBeInTheDocument();
    expect(screen.getByText(/all 3 trades your plan allows/i)).toBeInTheDocument();
  });

  test('respects a custom lock threshold from the server', () => {
    // 65% would be "tilt rising" at the default 80%, but this user locks at 60%
    render(<Dashboard user={user} metrics={metrics({ revengeRisk: 65, isLocked: true, lockReason: 'revenge', lockThreshold: 60 })} trades={[trade()]} onExecute={() => {}} />);
    expect(screen.getByRole('heading', { name: /hard lock engaged/i })).toBeInTheDocument();
  });

  test('mentions when a cool-off lock ends', () => {
    const until = new Date(Date.now() + 30 * 60000).toISOString();
    render(<Dashboard user={user} metrics={metrics({ revengeRisk: 100, isLocked: true, lockReason: 'revenge', lockedUntil: until })} trades={[trade()]} onExecute={() => {}} />);
    expect(screen.getByText(/locked until/i)).toBeInTheDocument();
  });

  test('lists live alerts from the server', () => {
    const warnings = [
      { code: 'rapid_reentry_window', severity: 'high', message: 'You closed a loss 4 min ago.' },
      { code: 'last_trade_of_day', severity: 'medium', message: 'One trade left in your daily limit.' },
    ];
    render(<Dashboard user={user} metrics={metrics({ warnings })} trades={[trade()]} onExecute={() => {}} />);
    const region = screen.getByRole('region', { name: /live alerts/i });
    expect(region).toHaveTextContent(/closed a loss 4 min ago/i);
    expect(region).toHaveTextContent(/one trade left/i);
  });
});

test('the gauge marks the user\'s own lock threshold', () => {
  render(<Dashboard user={user} metrics={metrics({ revengeRisk: 40, lockThreshold: 65 })} trades={[trade()]} onExecute={() => {}} />);
  expect(screen.getByRole('img', { name: /locks at 65 percent/i })).toBeInTheDocument();
  expect(screen.getByText(/lock at 65%/i)).toBeInTheDocument();
});
