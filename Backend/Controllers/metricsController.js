const Trade = require('../Models/Trade');
const metricsService = require('../Services/metricsService');

exports.getUserMetrics = async (req, res) => {
    try {
        // Scope to the authenticated user; the :userId param is ignored (IDOR guard).
        const trades = await Trade.find({ userId: req.user._id }).sort({ entryTime: 1 });
        res.status(200).json(metricsService.generateUserMetrics(req.user, trades));
    } catch (error) {
        console.error("Metrics Error:", error);
        res.status(500).json({ message: "Error calculating metrics" });
    }
};
