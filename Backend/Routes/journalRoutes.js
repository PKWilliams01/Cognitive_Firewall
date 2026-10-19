const express = require("express");
const router = express.Router();
const journalEntry = require("../Models/JournalEntry");
const { protect } = require("../Middleware/authMiddleware");

// Create a new journal entry
router.post("/", protect, async (req, res) => {
    try {
        // Trust the authenticated user, never a client-supplied userId
        const newEntry = new journalEntry({ ...req.body, userId: req.user._id });
        const savedEntry = await newEntry.save();
        res.status(201).json(savedEntry);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Get all journal entries for the authenticated user (:userId param ignored)
router.get("/user/:userId", protect, async (req, res) => {
    try {
        const entries = await journalEntry.find({ userId: req.user._id });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;