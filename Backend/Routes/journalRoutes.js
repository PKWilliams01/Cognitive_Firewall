const express = require("express");
const router = express.Router();
const journalEntry = require("../Models/JournalEntry");
const { protect } = require("../Middleware/authMiddleware");
const { firewallState } = require("./tradeRoutes");

// Create a mood check-in. The server snapshots the user's current firewall
// state so each entry records how disciplined/tilted they were at the time.
router.post("/", protect, async (req, res) => {
    try {
        const state = await firewallState(req.user);
        const { emotionalState, confidenceLevel, sessionType, notes } = req.body || {};
        const newEntry = new journalEntry({
            emotionalState,
            confidenceLevel,
            sessionType,
            notes,
            // Trust the authenticated user, never a client-supplied userId
            userId: req.user._id,
            disciplineScoreAtEntry: state.disciplineScore,
            revengeRiskAtEntry: state.revengeRisk,
        });
        const savedEntry = await newEntry.save();
        res.status(201).json(savedEntry);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Get the authenticated user's check-ins, newest first (:userId param ignored)
router.get("/user/:userId", protect, async (req, res) => {
    try {
        const entries = await journalEntry.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(200);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete one of the user's own check-ins
router.delete("/:id", protect, async (req, res) => {
    try {
        const result = await journalEntry.deleteOne({ _id: req.params.id, userId: req.user._id });
        if (!result.deletedCount) return res.status(404).json({ message: "Entry not found" });
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(400).json({ message: "Invalid entry id" });
    }
});

module.exports = router;
