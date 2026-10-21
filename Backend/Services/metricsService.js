// metricsService.js - The Centralised Calculation Engine

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const toNumber = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const parseDate = v => {
  const d = v ? new Date(v) : null;
  return Number.isFinite(d?.getTime()) ? d : null;
};

const { dayKey } = require('./dayKey');
const propGuard = require('./propGuard');

// Heat Accumulation constants (see dissertation §3.4 / §5.3)
const P = 30;            // base penalty per loss
const w = 20;            // coolant applied when the plan was followed
const RAPID_WINDOW_MIN = 15;
const RAPID_MULTIPLIER = 2.5;
const WIN_COOLING = 10;

exports.dayKey = dayKey;

// First instant of the next calendar day in a timezone (to the minute).
function nextDayStart(now, timeZone) {
  const today = dayKey(now, timeZone);
  let lo = now.getTime();
  let hi = lo + 50 * 60 * 60 * 1000;
  while (hi - lo > 60 * 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid), timeZone) === today) lo = mid; else hi = mid;
  }
  // Day boundaries fall on whole minutes, and hi is within a minute past one.
  return new Date(Math.floor(hi / 60000) * 60000);
}
exports.nextDayStart = nextDayStart;

exports.generateUserMetrics = (user, trades = [], now = new Date()) => {
  const hasTrades = trades.length > 0;
  const timeZone = user?.timezone || 'UTC';
  const dailyLimit = Math.max(toNumber(user?.plannedDailyLimit) || 3, 1);
  const lockThreshold = clamp(toNumber(user?.lockThreshold) || 80, 1, 100);
  const cooldownMinutes = Math.max(toNumber(user?.cooldownMinutes), 0);
  const maxRiskPercent = toNumber(user?.maxRiskPercent) || 5;

  // --- 1. SEPARATE HISTORICAL VS SESSION DATA ---
  const todayKey = dayKey(now, timeZone);
  const todayTrades = trades.filter(t => {
    const d = parseDate(t.entryTime || t.timestamp);
    return d && dayKey(d, timeZone) === todayKey;
  });
  const hasTradesToday = todayTrades.length > 0;

  // Default baselines
  let disciplineScore = 100;
  let revengeRisk = 0;
  let impulsivityIndex = 0;
  let dispositionRatio = '0.00';
  let systemIntegrity = 100;
  let netPnl = 0;
  let winRate = 0;
  let chartData = [];
  let lockStartedAt = null;

  if (hasTrades) {
    // ==========================================
    // A. ALL-TIME METRICS (Financial & Habits)
    // ==========================================
    netPnl = trades.reduce((acc, curr) => acc + toNumber(curr.pnl), 0);
    const winningTradesAllTime = trades.filter(t => toNumber(t.pnl) > 0);
    winRate = Math.round((winningTradesAllTime.length / trades.length) * 100);

    const losingTradesAllTime = trades.filter(t => toNumber(t.pnl) < 0);
    // Average hold time in minutes. Trades with an unknown duration (no entry
    // time, or entry == exit as with some broker imports) are excluded rather
    // than counted as zero-minute holds, which would skew the ratio.
    const avgMinutes = arr => {
      const durations = arr
        .map(t => (parseDate(t.exitTime)?.getTime() || 0) - (parseDate(t.entryTime)?.getTime() || 0))
        .filter(ms => ms > 0);
      if (!durations.length) return 0;
      return durations.reduce((a, b) => a + b, 0) / (1000 * 60) / durations.length;
    };

    const avgWin = avgMinutes(winningTradesAllTime);
    const avgLoss = avgMinutes(losingTradesAllTime);
    if (avgWin > 0) dispositionRatio = (avgLoss / avgWin).toFixed(2);
    else if (avgLoss > 0) dispositionRatio = avgLoss.toFixed(2);

    const userBalance = Math.max(toNumber(user?.startingBalance) || 1000, 1);
    let cumulativeReturn = 0;
    const chronoAll = [...trades].sort(
      (a, b) => (parseDate(a.entryTime)?.getTime() || 0) - (parseDate(b.entryTime)?.getTime() || 0)
    );
    chartData = chronoAll.map((t, i) => {
      const pct = (toNumber(t.pnl) / userBalance) * 100;
      cumulativeReturn += pct;
      return { name: `Trade ${i + 1}`, growth: Number(cumulativeReturn.toFixed(2)) };
    });

    // ==========================================
    // B. CURRENT SESSION METRICS (Today's Emotions)
    // ==========================================
    if (hasTradesToday) {
      const adherentTrades = todayTrades.filter(t => t.followedPlan).length;
      disciplineScore = clamp(Math.round((adherentTrades / todayTrades.length) * 100), 0, 100);

      impulsivityIndex = clamp(todayTrades.length / dailyLimit, 0, 10).toFixed(2);

      let heatAccumulation = 0;
      const chronoToday = [...todayTrades].sort(
        (a, b) => (parseDate(a.entryTime)?.getTime() || 0) - (parseDate(b.entryTime)?.getTime() || 0)
      );

      chronoToday.forEach((trade, i) => {
        const pnl = toNumber(trade.pnl);
        if (pnl < 0) {
          let M = 1;
          if (i > 0) {
            const prev = chronoToday[i - 1];
            const deltaMs = (parseDate(trade.entryTime)?.getTime() || 0) - (parseDate(prev.exitTime)?.getTime() || 0);
            const deltaMins = deltaMs / (1000 * 60);
            if (deltaMins > 0 && deltaMins < RAPID_WINDOW_MIN) M = RAPID_MULTIPLIER;
          }
          const C = trade.followedPlan ? 1 : 0;
          heatAccumulation += P * M - w * C;
        } else {
          heatAccumulation -= WIN_COOLING;
        }

        // Track when the current at-or-above-threshold streak last advanced:
        // every trade taken while hot restarts the cool-off.
        if (clamp(Math.round(heatAccumulation), 0, 100) >= lockThreshold) {
          lockStartedAt = parseDate(trade.exitTime) || parseDate(trade.entryTime);
        } else {
          lockStartedAt = null;
        }
      });

      revengeRisk = clamp(Math.round(heatAccumulation), 0, 100);
      systemIntegrity = Math.round((disciplineScore + (100 - revengeRisk)) / 2);
    }
  }

  // ==========================================
  // C. FIREWALL STATE (authoritative lock)
  // ==========================================
  const tradesToday = todayTrades.length;
  const tradesRemaining = Math.max(0, dailyLimit - tradesToday);

  let revengeLocked = revengeRisk >= lockThreshold;
  let lockedUntil = null;
  if (revengeLocked && cooldownMinutes > 0 && lockStartedAt) {
    const until = new Date(lockStartedAt.getTime() + cooldownMinutes * 60 * 1000);
    if (now >= until) revengeLocked = false;
    else lockedUntil = until.toISOString();
  }
  const dailyLocked = tradesRemaining <= 0;

  // Prop-firm guard outranks the behavioural locks: breaching it fails the account.
  const prop = propGuard.evaluate(user, trades, now);
  const propLocked = Boolean(prop.lockReason);
  const isLocked = propLocked || revengeLocked || dailyLocked;
  const lockReason = propLocked ? prop.lockReason : revengeLocked ? 'revenge' : dailyLocked ? 'daily_limit' : null;
  if (prop.lockReason === 'prop_daily') lockedUntil = nextDayStart(now, prop.resetTimezone).toISOString();
  else if (prop.lockReason === 'prop_max') lockedUntil = null;

  // ==========================================
  // D. CONTEXTUAL BEHAVIOURAL WARNINGS
  // ==========================================
  const warnings = [...(prop.warnings || [])];
  if (hasTradesToday && !isLocked) {
    const lastTrade = [...todayTrades].sort(
      (a, b) => (parseDate(b.exitTime)?.getTime() || 0) - (parseDate(a.exitTime)?.getTime() || 0)
    )[0];
    const lastExit = parseDate(lastTrade?.exitTime);
    if (lastTrade && toNumber(lastTrade.pnl) < 0 && lastExit) {
      const minsSince = (now.getTime() - lastExit.getTime()) / 60000;
      if (minsSince >= 0 && minsSince < RAPID_WINDOW_MIN) {
        warnings.push({
          code: 'rapid_reentry_window',
          severity: 'high',
          message: `You closed a loss ${Math.max(1, Math.round(minsSince))} min ago. Entering again inside ${RAPID_WINDOW_MIN} minutes is the classic revenge pattern — and it more than doubles the heat added if it loses.`,
        });
      }
    }
    if (revengeRisk >= 50) {
      warnings.push({
        code: 'tilt_rising',
        severity: 'medium',
        message: `Revenge risk is ${revengeRisk}% — the Hard Lock engages at ${lockThreshold}%. Slow down before the next entry.`,
      });
    }
    if (tradesRemaining === 1) {
      warnings.push({
        code: 'last_trade_of_day',
        severity: 'medium',
        message: 'One trade left in your daily limit. Make it an A+ setup or call it a day.',
      });
    }
    if (disciplineScore < 60) {
      warnings.push({
        code: 'discipline_low',
        severity: 'medium',
        message: `Only ${disciplineScore}% of today's trades followed your plan.`,
      });
    }
  }
  if (toNumber(dispositionRatio) > 1.5 && trades.some(t => toNumber(t.pnl) < 0) && trades.some(t => toNumber(t.pnl) > 0)) {
    warnings.push({
      code: 'disposition',
      severity: 'low',
      message: `You hold losing trades ${toNumber(dispositionRatio).toFixed(1)}× longer than winners — the disposition effect.`,
    });
  }

  // THE SECURE PAYLOAD!
  return {
    hasTrades,
    disciplineScore,
    revengeRisk,
    impulsivityIndex,
    dispositionRatio,
    systemIntegrity,
    netPnl,
    winRate,
    chartData,
    // firewall state
    isLocked,
    lockReason,
    lockedUntil,
    lockThreshold,
    cooldownMinutes,
    tradesToday,
    tradesRemaining,
    dailyLimit,
    maxRiskPercent,
    warnings,
    propGuard: prop.enabled ? { ...prop, warnings: undefined } : { enabled: false },
  };
};
