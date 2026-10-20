const express = require("express");
const router = express.Router();
const Trade = require("../Models/Trade");
const metricsService = require("../Services/metricsService");
const { protect } = require('../Middleware/authMiddleware');

// Authoritative firewall state for a user, computed on the server so the
// client cannot bypass it (dissertation §4.4 / Objective 3 limitation).
async function firewallState(user) {
    const trades = await Trade.find({ userId: user._id }).sort({ entryTime: 1 });
    return metricsService.generateUserMetrics(user, trades);
}

const lockMessage = (state) =>
    state.lockReason === 'daily_limit'
        ? `Daily limit reached (${state.dailyLimit} trades). The firewall reopens tomorrow.`
        : state.lockedUntil
            ? `Hard Lock engaged — revenge risk ${state.revengeRisk}%. Cool-off until ${state.lockedUntil}.`
            : `Hard Lock engaged — revenge risk ${state.revengeRisk}%. Execution is locked for the rest of the trading day.`;

const lockedResponse = (res, state) =>
    res.status(423).json({
        code: 'locked',
        lockReason: state.lockReason,
        lockedUntil: state.lockedUntil,
        revengeRisk: state.revengeRisk,
        message: lockMessage(state),
    });

// 0. PRE-FLIGHT — server-side approval before a trade is opened.
router.post("/preflight", protect, async (req, res) => {
    try {
        const state = await firewallState(req.user);
        if (state.isLocked) return lockedResponse(res, state);

        const risk = Number(req.body.riskPercentage);
        if (!Number.isFinite(risk) || risk <= 0) {
            return res.status(422).json({ code: 'invalid_risk', message: 'Enter a risk percentage greater than 0.' });
        }
        if (risk > state.maxRiskPercent) {
            return res.status(422).json({
                code: 'risk_cap',
                message: `Risk ${risk}% exceeds your ${state.maxRiskPercent}% per-trade cap.`,
            });
        }

        // [HARD] rules must always be confirmed, whatever the strict setting.
        const hardChecked = Number(req.body.hardChecked) || 0;
        const hardTotal = Number(req.body.hardTotal) || 0;
        if (hardTotal > 0 && hardChecked < hardTotal) {
            return res.status(422).json({
                code: 'hard_rules',
                message: `${hardTotal - hardChecked} system-critical rule${hardTotal - hardChecked === 1 ? '' : 's'} not confirmed. Hard rules can't be skipped.`,
            });
        }

        const checked = Number(req.body.confluencesChecked) || 0;
        const total = Number(req.body.confluencesTotal) || 0;
        if (req.user.strictConfluence && total > 0 && checked < total) {
            return res.status(422).json({
                code: 'confluences',
                message: `Only ${checked}/${total} confluences confirmed. Strict mode requires every rule before execution.`,
            });
        }

        res.json({
            approved: true,
            tradesRemaining: state.tradesRemaining,
            warnings: state.warnings,
        });
    } catch (err) {
        console.error("Preflight Error:", err);
        res.status(500).json({ message: 'Pre-flight check failed' });
    }
});

// 1. CREATE TRADE
router.post("/", protect, async (req, res) => {
    try {
        // "Block everything": no manual logging while the firewall is locked.
        const state = await firewallState(req.user);
        if (state.isLocked) return lockedResponse(res, state);

        const risk = Number(req.body.riskPercentage);
        if (Number.isFinite(risk) && risk > state.maxRiskPercent) {
            return res.status(422).json({
                code: 'risk_cap',
                message: `Risk ${risk}% exceeds your ${state.maxRiskPercent}% per-trade cap.`,
            });
        }

        // Trust the authenticated user, never a client-supplied userId
        const newTrade = new Trade({ ...req.body, userId: req.user._id, source: 'manual' });
        const savedTrade = await newTrade.save();
        res.status(201).json(savedTrade);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 2. GET TRADES
router.get("/user/:userId", protect, async (req, res) => {
    try {
        // Scope to the authenticated user; the :userId param is ignored so a
        // caller cannot read another user's trades by changing the URL.
        const trades = await Trade.find({ userId: req.user._id }).sort({ entryTime: -1 });
        res.json(trades);
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ error: err.message });
    }
});


// 3. GET METRICS (Calculates Revenge Risk, Discipline, etc.)
router.get("/metrics/:userId", protect, async (req, res) => {
    try {
        // Scope to the authenticated user; ignore the :userId param (IDOR guard)
        res.json(await firewallState(req.user));
    } catch (err) {
        console.error("Metrics Error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
module.exports.firewallState = firewallState;
