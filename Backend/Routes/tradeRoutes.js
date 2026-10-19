const User = require("../Models/User");
const express = require("express");
const router = express.Router();
const Trade = require("../Models/Trade"); 
const metricsService = require("../Services/metricsService");
const { protect } = require('../Middleware/authMiddleware');
// 1. CREATE TRADE
router.post("/", protect, async (req, res) => {
    try {
        // Trust the authenticated user, never a client-supplied userId
        const newTrade = new Trade({ ...req.body, userId: req.user._id });
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
        const userId = req.user._id;
        const trades = await Trade.find({ userId: userId }).sort({ entryTime: 1 });
        const user = req.user;

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Run our new Centralised Calculation Engine!
        const metrics = metricsService.generateUserMetrics(user, trades);

        // Send the complete package to React (including chartData and hasTrades)
        res.json(metrics);

    } catch (err) {
        console.error("Metrics Error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
