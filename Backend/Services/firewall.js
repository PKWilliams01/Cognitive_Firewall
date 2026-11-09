const Trade = require("../Models/Trade");
const metricsService = require("./metricsService");
const push = require("./push");

// Authoritative firewall state for a user, computed on the server so the
// client cannot bypass it (dissertation §4.4 / Objective 3 limitation).
// Every recompute is also a chance to push an alert if the level changed.
async function firewallState(user) {
    const trades = await Trade.find({ userId: user._id }).sort({ entryTime: 1 });
    const state = metricsService.generateUserMetrics(user, trades);
    // The integration tests drive state directly; push has its own tests.
    if (process.env.NODE_ENV !== "test" || process.env.PUSH_IN_TESTS) push.notifyQuietly(user, state);
    return state;
}

module.exports = { firewallState };
