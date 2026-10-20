const mongoose = require("mongoose");

const BrokerConnectionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    broker: { type: String, enum: ["oanda", "alpaca", "binance"], required: true },
    // practice/paper/testnet vs live — selects a fixed, hard-coded base URL.
    environment: { type: String, enum: ["practice", "live"], required: true },
    label: { type: String, maxlength: 80 },
    accountId: { type: String },
    keyHint: { type: String },
    // AES-256-GCM sealed credentials; never returned to the client.
    credentials: {
        iv: { type: String, required: true },
        tag: { type: String, required: true },
        data: { type: String, required: true },
    },
    // Opt-in: act on the broker account when the Hard Lock engages.
    enforceLock: { type: Boolean, default: false },
    lockActive: { type: Boolean, default: false },
    lastLockAction: {
        type: { type: String },
        at: Date,
        ok: Boolean,
        detail: String,
    },
    status: { type: String, enum: ["connected", "error"], default: "connected" },
    lastSyncAt: Date,
    lastError: String,
    importedCount: { type: Number, default: 0 },
}, { timestamps: true });

BrokerConnectionSchema.index({ userId: 1, broker: 1, environment: 1, accountId: 1 }, { unique: true });

module.exports = mongoose.model("BrokerConnection", BrokerConnectionSchema);
