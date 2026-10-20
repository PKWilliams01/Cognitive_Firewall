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

// Calendar day (YYYY-MM-DD) of a date in the user's timezone. The server runs
// in UTC, so "today" must be resolved against the trader's own clock.
const dayKey = (date, timeZone) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

// Heat Accumulation constants (see dissertation §3.4 / §5.3)
const P = 30;            // base penalty per loss
const w = 20;            // coolant applied when the plan was followed
const RAPID_WINDOW_MIN = 15;
const RAPID_MULTIPLIER = 2.5;
const WIN_COOLING = 10;

exports.dayKey = dayKey;

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
    const avgMinutes = arr => {
      if (!arr.length) return 0;
      const total = arr.reduce((acc, t) => {
        const entry = parseDate(t.entryTime)?.getTime();
        const exit = parseDate(t.exitTime)?.getTime();
        if (!entry || !exit) return acc;
        return acc + Math.max(0, exit - entry);
      }, 0);
      return total / (1000 * 60) / arr.length;
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
  const isLocked = revengeLocked || dailyLocked;
  const lockReason = revengeLocked ? 'revenge' : dailyLocked ? 'daily_limit' : null;

  // ==========================================
  // D. CONTEXTUAL BEHAVIOURAL WARNINGS
  // ==========================================
  const warnings = [];
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
  };
};
