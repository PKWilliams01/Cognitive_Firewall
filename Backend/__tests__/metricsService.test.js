const { generateUserMetrics } = require('../Services/metricsService');

// Helpers to build trades dated "today" so the session-based metrics engage.
const todayAt = (hour, min = 0) => {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d;
};

// A trade entered `gapMins` after the previous trade's exit, lasting `durMins`.
const trade = ({ pnl, followedPlan = true, entry, durMins = 10 }) => ({
  pnl,
  followedPlan,
  entryTime: entry,
  exitTime: new Date(entry.getTime() + durMins * 60 * 1000),
});

// Use the machine's timezone so "today" matches todayAt() regardless of the hour
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (overrides = {}) => ({ plannedDailyLimit: 3, startingBalance: 1000, timezone: LOCAL_TZ, ...overrides });

describe('generateUserMetrics', () => {
  test('returns safe defaults when there are no trades', () => {
    const m = generateUserMetrics(user(), []);
    expect(m.hasTrades).toBe(false);
    expect(m.disciplineScore).toBe(100);
    expect(m.revengeRisk).toBe(0);
    expect(m.impulsivityIndex).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.netPnl).toBe(0);
    expect(m.chartData).toEqual([]);
  });

  test('a single disciplined winning trade keeps revenge risk at zero', () => {
    const trades = [trade({ pnl: 250, followedPlan: true, entry: todayAt(9) })];
    const m = generateUserMetrics(user(), trades);
    expect(m.hasTrades).toBe(true);
    expect(m.netPnl).toBe(250);
    expect(m.winRate).toBe(100);
    expect(m.disciplineScore).toBe(100);
    // one win cools heat to -10, clamped to 0
    expect(m.revengeRisk).toBe(0);
    expect(m.systemIntegrity).toBe(100);
    // impulsivityIndex = todayTrades/limit = 1/3
    expect(m.impulsivityIndex).toBe('0.33');
  });

  test('rapid, plan-breaking losses drive revenge risk to the ceiling', () => {
    const t1 = trade({ pnl: 250, followedPlan: true, entry: todayAt(9, 0) });
    // each loss entered 5 min after the previous exit -> rapid (M=2.5), plan broken (C=0)
    const t2 = trade({ pnl: -400, followedPlan: false, entry: new Date(t1.exitTime.getTime() + 5 * 60 * 1000) });
    const t3 = trade({ pnl: -350, followedPlan: false, entry: new Date(t2.exitTime.getTime() + 5 * 60 * 1000) });
    const m = generateUserMetrics(user({ plannedDailyLimit: 8 }), [t1, t2, t3]);
    // heat = -10 + 75 + 75 = 140 -> clamp 100
    expect(m.revengeRisk).toBe(100);
    // discipline = adherent(1)/3 = 33
    expect(m.disciplineScore).toBe(33);
    // win rate = 1 win / 3 = 33
    expect(m.winRate).toBe(33);
    expect(m.netPnl).toBe(-500);
    expect(m.systemIntegrity).toBe(Math.round((33 + (100 - 100)) / 2));
  });

  test('a rule-followed loss raises revenge risk less than a rule-broken one', () => {
    const base = todayAt(10, 0);
    const followed = generateUserMetrics(user({ plannedDailyLimit: 8 }), [
      trade({ pnl: -100, followedPlan: true, entry: base }),
    ]);
    const broken = generateUserMetrics(user({ plannedDailyLimit: 8 }), [
      trade({ pnl: -100, followedPlan: false, entry: base }),
    ]);
    // single first trade: M=1 (no prior). followed C=1 -> 30-20=10; broken C=0 -> 30
    expect(followed.revengeRisk).toBe(10);
    expect(broken.revengeRisk).toBe(30);
    expect(broken.revengeRisk).toBeGreaterThan(followed.revengeRisk);
  });

  test('discipline score reflects the share of plan-adherent trades', () => {
    const t1 = trade({ pnl: 50, followedPlan: true, entry: todayAt(9) });
    const t2 = trade({ pnl: 50, followedPlan: false, entry: todayAt(10) });
    const m = generateUserMetrics(user({ plannedDailyLimit: 8 }), [t1, t2]);
    expect(m.disciplineScore).toBe(50); // 1 of 2 adherent
  });

  test('impulsivity index scales with the configured daily limit', () => {
    const trades = [
      trade({ pnl: 10, entry: todayAt(9) }),
      trade({ pnl: 10, entry: todayAt(10) }),
    ];
    expect(generateUserMetrics(user({ plannedDailyLimit: 2 }), trades).impulsivityIndex).toBe('1.00');
    expect(generateUserMetrics(user({ plannedDailyLimit: 4 }), trades).impulsivityIndex).toBe('0.50');
  });

  test('chart data accumulates return percentage against starting balance', () => {
    const trades = [
      trade({ pnl: 100, entry: todayAt(9) }),   // +10% of 1000
      trade({ pnl: -50, entry: todayAt(10) }),  // -5%
    ];
    const m = generateUserMetrics(user({ startingBalance: 1000 }), trades);
    expect(m.chartData).toHaveLength(2);
    expect(m.chartData[0].growth).toBeCloseTo(10, 5);
    expect(m.chartData[1].growth).toBeCloseTo(5, 5); // 10 - 5
  });
});
