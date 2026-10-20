import { summariseDays, computeStreaks, nextMilestone, buildCalendar, dayKey, shiftKey } from './discipline';

const t = (iso, followedPlan, pnl = 10) => ({ entryTime: iso, followedPlan, pnl });

test('summarises each trading day in the trader\'s timezone', () => {
  const days = summariseDays([
    t('2026-06-10T09:00:00Z', true, 50),
    t('2026-06-10T11:00:00Z', false, -20),
    // 23:30 UTC on the 10th is already the 11th in Tokyo
    t('2026-06-10T23:30:00Z', true, 5),
  ], 'Asia/Tokyo');
  expect(days.get('2026-06-10')).toMatchObject({ trades: 2, followed: 1, pnl: 30, discipline: 50, disciplined: false });
  expect(days.get('2026-06-11')).toMatchObject({ trades: 1, disciplined: true });
});

test('a streak counts consecutive disciplined trading days; rest days do not break it', () => {
  const days = summariseDays([
    t('2026-06-01T09:00:00Z', true),
    t('2026-06-02T09:00:00Z', false), // broken day resets
    t('2026-06-03T09:00:00Z', true),
    t('2026-06-04T09:00:00Z', true),
    // 5th and 6th: no trades (weekend) — streak survives
    t('2026-06-07T09:00:00Z', true),
  ], 'UTC');
  expect(computeStreaks(days)).toEqual({ current: 3, best: 3 });
});

test('the current streak is zero after a broken day, while the best is remembered', () => {
  const days = summariseDays([
    t('2026-06-01T09:00:00Z', true),
    t('2026-06-02T09:00:00Z', true),
    t('2026-06-03T09:00:00Z', true),
    t('2026-06-04T09:00:00Z', true),
    t('2026-06-05T09:00:00Z', false),
  ], 'UTC');
  expect(computeStreaks(days)).toEqual({ current: 0, best: 4 });
});

test('milestones report what is earned and progress toward the next', () => {
  expect(nextMilestone(0)).toMatchObject({ next: 3, earned: [], progress: 0 });
  expect(nextMilestone(5)).toMatchObject({ next: 7, earned: [3] });
  expect(nextMilestone(5).progress).toBeCloseTo(0.5);
  expect(nextMilestone(150)).toMatchObject({ next: null, progress: 1 });
});

test('calendar is Monday-first, ends this week, and grades each day', () => {
  const now = new Date('2026-06-10T12:00:00Z'); // a Wednesday
  const days = summariseDays([
    t('2026-06-08T09:00:00Z', true), // Mon: clean
    t('2026-06-09T09:00:00Z', true),
    t('2026-06-09T10:00:00Z', false), // Tue: 50% -> mixed
    t('2026-06-10T09:00:00Z', false), // Wed: broken
  ], 'UTC');
  const cols = buildCalendar(days, { weeks: 2, now, timeZone: 'UTC' });
  expect(cols).toHaveLength(2);
  expect(cols[0][0].key).toBe('2026-06-01');
  const thisWeek = cols[1];
  expect(thisWeek.map((c) => c.key)[0]).toBe('2026-06-08');
  expect(thisWeek[0].level).toBe('clean');
  expect(thisWeek[1].level).toBe('mixed');
  expect(thisWeek[2]).toMatchObject({ level: 'broken', today: true });
  expect(thisWeek[3].future).toBe(true);
});

test('date helpers are timezone-safe', () => {
  expect(shiftKey('2026-03-29', 1)).toBe('2026-03-30'); // across a DST change
  expect(shiftKey('2026-01-01', -1)).toBe('2025-12-31');
  expect(dayKey('2026-06-10T23:30:00Z', 'Not/AZone')).toBe('2026-06-10');
});
