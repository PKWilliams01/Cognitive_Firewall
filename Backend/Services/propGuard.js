// Prop-firm rule guard: locks the trader out *before* a funded/challenge
// account breaches its daily-loss or max-loss rule.
//
// Works on closed trades only (floating P/L isn't visible to us), which is why
// the lock fires a safety buffer short of the real limit.

const { dayKey } = require("./dayKey");

// Starting points only. Firms change their rules, so every value stays
// editable in Settings.
const PRESETS = {
    ftmo: { label: "FTMO", daily: 5, max: 10, type: "static", resetTimezone: "Europe/Prague" },
    // MetaTrader servers for most other firms run on GMT+2/+3 (Athens time).
    custom: { label: "Custom", daily: 5, max: 10, type: "static", resetTimezone: "Europe/Athens" },
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n) => Math.round(n * 100) / 100;
const toDate = (v) => {
    const d = v ? new Date(v) : null;
    return d && Number.isFinite(d.getTime()) ? d : null;
};

function evaluate(user, trades = [], now = new Date()) {
    if (!user?.propGuardEnabled) return { enabled: false };

    const size = Math.max(num(user.propAccountSize), 1);
    const dailyPct = num(user.propDailyLossPercent);
    const maxPct = num(user.propMaxLossPercent);
    const buffer = size * num(user.propBufferPercent) / 100;
    const tz = user.propResetTimezone || "UTC";
    const start = toDate(user.propStartDate);

    // Closed trades in this challenge, in close order.
    const inChallenge = trades
        .map((t) => ({ pnl: num(t.pnl), exit: toDate(t.exitTime) || toDate(t.entryTime) }))
        .filter((t) => t.exit && (!start || t.exit >= start) && t.exit <= now)
        .sort((a, b) => a.exit - b.exit);

    // Daily loss: today's realised P/L, with "today" defined by the firm's reset clock.
    const today = dayKey(now, tz);
    const todayPnl = inChallenge.filter((t) => dayKey(t.exit, tz) === today).reduce((a, t) => a + t.pnl, 0);
    const dailyLimit = size * dailyPct / 100;
    const dailyUsed = Math.max(0, -todayPnl);

    // Max loss: static floor at size − max%, or trailing from the balance high-water mark.
    let balance = size;
    let peak = size;
    for (const t of inChallenge) {
        balance += t.pnl;
        peak = Math.max(peak, balance);
    }
    const maxLimit = size * maxPct / 100;
    const floor = user.propMaxLossType === "trailing" ? Math.min(peak, size + maxLimit) - maxLimit : size - maxLimit;
    const maxUsed = Math.max(0, maxLimit - (balance - floor));

    const dailyRoom = dailyLimit - buffer - dailyUsed;
    const maxRoom = maxLimit - buffer - maxUsed;
    const dailyBreached = dailyPct > 0 && dailyRoom <= 0;
    const maxBreached = maxPct > 0 && maxRoom <= 0;

    const state = {
        enabled: true,
        firm: user.propFirm || "custom",
        firmLabel: PRESETS[user.propFirm]?.label || "Custom",
        accountSize: size,
        balance: round2(balance),
        todayPnl: round2(todayPnl),
        dailyLimit: round2(dailyLimit),
        dailyUsed: round2(dailyUsed),
        dailyRoom: round2(Math.max(0, dailyRoom)),
        maxLimit: round2(maxLimit),
        maxUsed: round2(maxUsed),
        maxRoom: round2(Math.max(0, maxRoom)),
        floor: round2(floor),
        buffer: round2(buffer),
        maxLossType: user.propMaxLossType || "static",
        resetTimezone: tz,
        lockReason: maxBreached ? "prop_max" : dailyBreached ? "prop_daily" : null,
        warnings: [],
    };

    if (!state.lockReason) {
        const dailyShare = dailyLimit ? dailyUsed / (dailyLimit - buffer || dailyLimit) : 0;
        const maxShare = maxLimit ? maxUsed / (maxLimit - buffer || maxLimit) : 0;
        if (dailyShare >= 0.5) {
            state.warnings.push({
                code: "prop_daily_near",
                severity: dailyShare >= 0.75 ? "high" : "medium",
                message: `You've used ${Math.round(dailyShare * 100)}% of today's ${state.firmLabel} loss allowance. ${round2(Math.max(0, dailyRoom))} left before the guard locks you out.`,
            });
        }
        if (maxShare >= 0.5) {
            state.warnings.push({
                code: "prop_max_near",
                severity: maxShare >= 0.75 ? "high" : "medium",
                message: `Account is ${Math.round(maxShare * 100)}% of the way to the ${state.firmLabel} max-loss floor (${round2(floor)}).`,
            });
        }
    }
    return state;
}

// Can a trade risking this much still fit inside today's and overall room?
function roomFor(state, riskAmount) {
    if (!state?.enabled || state.lockReason) return { ok: !state?.lockReason };
    const room = Math.min(state.dailyRoom, state.maxRoom);
    return { ok: riskAmount <= room, room };
}

module.exports = { PRESETS, evaluate, roomFor };
