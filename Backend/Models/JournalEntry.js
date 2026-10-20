const mongoose = require("mongoose");

const JournalEntrySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    emotionalState: {
        type: String,
        enum: ['CALM', 'CONFIDENT', 'ANXIOUS', 'FRUSTRATED', 'IMPULSIVE', 'FOCUSED'],
        required: true
    },

    confidenceLevel: {
        type: Number,
        min: 1,
        max: 10,
        required: true
    },

    // --- Cognitive Metrics ---
    // Captures the state of the "Firewall" when the user journaled
    disciplineScoreAtEntry: {
        type: Number,
        default: 100
    },

    revengeRiskAtEntry: {
        type: Number,
        default: 0
    },

    // --- Contextual Trading Data ---
    sessionType: {
        type: String,
        enum: ['PRE-MARKET', 'IN-TRADE', 'POST-MARKET', 'BREAK'],
        default: 'POST-MARKET'
    },

    notes: {
        type: String,
        maxlength: 1000,
    },

    // Fixed 'Timestamp' to lowercase 'timestamp' (standard JS convention)
    timestamp: {
        type: Date,
        default: Date.now
    }
}); 

module.exports = mongoose.model("JournalEntry", JournalEntrySchema);