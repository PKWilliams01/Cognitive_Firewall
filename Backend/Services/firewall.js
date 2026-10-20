const Trade = require("../Models/Trade");
const metricsService = require("./metricsService");

// Authoritative firewall state for a user, computed on the server so the
// client cannot bypass it (dissertation §4.4 / Objective 3 limitation).
async function firewallState(user) {
    const trades = await Trade.find({ userId: user._id }).sort({ entryTime: 1 });
    return metricsService.generateUserMetrics(user, trades);
}

module.exports = { firewallState };
