const { generateUserMetrics, dayKey } = require('../Services/metricsService');

const TZ = 'Europe/London';
const at = (iso) => new Date(iso);
const trade = (entry, exit, pnl, followedPlan = true) => ({
  entryTime: at(entry), exitTime: at(exit), pnl, followedPlan,
});
const user = (o = {}) => ({ plannedDailyLimit: 8, startingBalance: 1000, timezone: TZ, ...o });

// A win then two rapid, plan-broken losses: heat -10 +75 +75 -> 100
const spiral = [
  trade('2026-06-10T09:00:00Z', '2026-06-10T09:20:00Z', 200),
  trade('2026-06-10T09:25:00Z', '2026-06-10T09:30:00Z', -150, false),
  trade('2026-06-10T09:35:00Z', '2026-06-10T09:40:00Z', -200, false),
];

describe('firewall lock state', () => {
  test('revenge lock engages at the default 80% threshold', () => {
    const m = generateUserMetrics(user(), spiral, at('2026-06-10T10:00:00Z'));
    expect(m.revengeRisk).toBe(100);
    expect(m.isLocked).toBe(true);
    expect(m.lockReason).toBe('revenge');
    expect(m.lockedUntil).toBeNull(); // cooldown 0 = rest of the day
  });

  test('a stricter custom threshold locks earlier', () => {
    const twoTrades = spiral.slice(0, 2); // heat -10 + 75 = 65
    expect(generateUserMetrics(user(), twoTrades, at('2026-06-10T10:00:00Z')).isLocked).toBe(false);
    const strict = generateUserMetrics(user({ lockThreshold: 60 }), twoTrades, at('2026-06-10T10:00:00Z'));
    expect(strict.isLocked).toBe(true);
    expect(strict.lockThreshold).toBe(60);
  });

  test('cooldown releases the revenge lock after the configured minutes', () => {
    const u = user({ cooldownMinutes: 30 });
    const during = generateUserMetrics(u, spiral, at('2026-06-10T09:55:00Z'));
    expect(during.isLocked).toBe(true);
    expect(during.lockedUntil).toBe('2026-06-10T10:10:00.000Z'); // last trade exit + 30m

    const after = generateUserMetrics(u, spiral, at('2026-06-10T10:11:00Z'));
    expect(after.isLocked).toBe(false);
    expect(after.revengeRisk).toBe(100); // the score itself is unchanged
  });

  test('daily limit locks once today\'s trades reach the plan', () => {
    const m = generateUserMetrics(user({ plannedDailyLimit: 3 }), spiral, at('2026-06-10T12:00:00Z'));
    expect(m.tradesToday).toBe(3);
    expect(m.tradesRemaining).toBe(0);
    expect(m.isLocked).toBe(true);
  });

  test('revenge reason takes precedence when both locks apply', () => {
    const m = generateUserMetrics(user({ plannedDailyLimit: 3 }), spiral, at('2026-06-10T10:00:00Z'));
    expect(m.lockReason).toBe('revenge');
  });

  test('trades from a previous day do not count toward today', () => {
    const m = generateUserMetrics(user(), spiral, at('2026-06-11T09:00:00Z'));
    expect(m.tradesToday).toBe(0);
    expect(m.revengeRisk).toBe(0);
    expect(m.isLocked).toBe(false);
  });
});

describe('trading day follows the user timezone', () => {
  test('dayKey resolves the calendar date in the given zone', () => {
    // 23:30 UTC on 10 June is already 11 June in Tokyo
    expect(dayKey(at('2026-06-10T23:30:00Z'), 'UTC')).toBe('2026-06-10');
    expect(dayKey(at('2026-06-10T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-06-11');
  });

  test('a late-night trade counts as "today" for a user ahead of UTC', () => {
    const late = [trade('2026-06-10T23:30:00Z', '2026-06-10T23:40:00Z', 50)];
    const now = at('2026-06-10T23:50:00Z');
    expect(generateUserMetrics(user({ timezone: 'Asia/Tokyo' }), late, now).tradesToday).toBe(1);
    expect(generateUserMetrics(user({ timezone: 'UTC' }), late, now).tradesToday).toBe(1);
    // ...but for Tokyo the next UTC morning is still the same local day? no — 09:00 UTC 11 Jun is 18:00 JST 11 Jun
    expect(generateUserMetrics(user({ timezone: 'Asia/Tokyo' }), late, at('2026-06-11T09:00:00Z')).tradesToday).toBe(1);
    expect(generateUserMetrics(user({ timezone: 'UTC' }), late, at('2026-06-11T09:00:00Z')).tradesToday).toBe(0);
  });

  test('an invalid timezone falls back to UTC instead of crashing', () => {
    expect(() => generateUserMetrics(user({ timezone: 'Not/AZone' }), spiral, at('2026-06-10T10:00:00Z'))).not.toThrow();
  });
});

describe('contextual warnings', () => {
  const codes = (m) => m.warnings.map((w) => w.code);

  test('warns about the rapid re-entry window right after a loss', () => {
    const t = [trade('2026-06-10T09:00:00Z', '2026-06-10T09:10:00Z', -50)];
    expect(codes(generateUserMetrics(user(), t, at('2026-06-10T09:15:00Z')))).toContain('rapid_reentry_window');
    expect(codes(generateUserMetrics(user(), t, at('2026-06-10T09:40:00Z')))).not.toContain('rapid_reentry_window');
  });

  test('warns when only one trade remains', () => {
    const t = [trade('2026-06-10T09:00:00Z', '2026-06-10T09:10:00Z', 50), trade('2026-06-10T10:00:00Z', '2026-06-10T10:10:00Z', 50)];
    expect(codes(generateUserMetrics(user({ plannedDailyLimit: 3 }), t, at('2026-06-10T12:00:00Z')))).toContain('last_trade_of_day');
  });

  test('no session warnings while locked (the lock speaks for itself)', () => {
    const m = generateUserMetrics(user(), spiral, at('2026-06-10T09:45:00Z'));
    expect(m.isLocked).toBe(true);
    expect(codes(m)).not.toContain('rapid_reentry_window');
  });
});

test('equity curve is normalised against the user\'s real starting balance', () => {
  const t = [trade('2026-06-10T09:00:00Z', '2026-06-10T09:10:00Z', 100)];
  expect(generateUserMetrics(user({ startingBalance: 1000 }), t).chartData[0].growth).toBe(10);
  expect(generateUserMetrics(user({ startingBalance: 10000 }), t).chartData[0].growth).toBe(1);
});
