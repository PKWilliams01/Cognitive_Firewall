// Daily discipline history, streaks and milestones — derived from the trade log.
//
// A "disciplined day" is a trading day on which every trade followed the plan.
// Days without trades don't break a streak: not trading is a valid choice.

export const MILESTONES = [3, 7, 14, 30, 60, 100];

const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// YYYY-MM-DD in the trader's timezone (matches the server's trading day).
export const dayKey = (date, timeZone = 'UTC') => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
};

// Shift a YYYY-MM-DD key by whole days (calendar arithmetic, no timezone drift).
export const shiftKey = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};

/** Map of dayKey -> { trades, followed, pnl, discipline, disciplined } */
export function summariseDays(trades = [], timeZone = 'UTC') {
  const days = new Map();
  trades.forEach((t) => {
    const when = t.entryTime || t.timestamp || t.createdAt;
    if (!when) return;
    const key = dayKey(when, timeZone);
    const d = days.get(key) || { trades: 0, followed: 0, pnl: 0 };
    d.trades += 1;
    if (t.followedPlan) d.followed += 1;
    d.pnl += toNumber(t.pnl);
    days.set(key, d);
  });
  days.forEach((d) => {
    d.discipline = Math.round((d.followed / d.trades) * 100);
    d.disciplined = d.followed === d.trades;
  });
  return days;
}

/** Current and best streak of disciplined trading days. */
export function computeStreaks(days) {
  const keys = [...days.keys()].sort(); // oldest -> newest
  let best = 0;
  let run = 0;
  keys.forEach((k) => {
    if (days.get(k).disciplined) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  });
  return { current: run, best };
}

export function nextMilestone(current) {
  const next = MILESTONES.find((m) => m > current) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= current) ?? 0;
  return {
    next,
    earned: MILESTONES.filter((m) => m <= current),
    progress: next ? (current - prev) / (next - prev) : 1,
  };
}

/**
 * Calendar cells for the last `weeks` weeks, Monday-first, ending with the
 * current week. Each cell: { key, level, summary, future }.
 */
export function buildCalendar(days, { weeks = 13, now = new Date(), timeZone = 'UTC' } = {}) {
  const todayKey = dayKey(now, timeZone);
  const [y, m, d] = todayKey.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon=0
  const start = shiftKey(todayKey, -weekday - (weeks - 1) * 7);

  const columns = [];
  for (let w = 0; w < weeks; w += 1) {
    const col = [];
    for (let i = 0; i < 7; i += 1) {
      const key = shiftKey(start, w * 7 + i);
      const summary = days.get(key) || null;
      const future = key > todayKey;
      let level = 'none';
      if (summary) level = summary.disciplined ? 'clean' : summary.discipline >= 50 ? 'mixed' : 'broken';
      col.push({ key, level, summary, future, today: key === todayKey });
    }
    columns.push(col);
  }
  return columns;
}
