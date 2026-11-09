const mongoose = require("mongoose");

// Small server-wide key/value store (e.g. generated VAPID keys).
const AppConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model("AppConfig", AppConfigSchema);
