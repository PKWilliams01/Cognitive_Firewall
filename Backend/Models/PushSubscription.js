const mongoose = require("mongoose");

// One browser/device that has opted in to push alerts.
const PushSubscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
    },
    userAgent: { type: String, maxlength: 300 },
}, { timestamps: true });

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);
