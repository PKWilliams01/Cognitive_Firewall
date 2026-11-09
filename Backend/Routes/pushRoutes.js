const express = require("express");
const router = express.Router();
const PushSubscription = require("../Models/PushSubscription");
const { protect } = require("../Middleware/authMiddleware");
const push = require("../Services/push");

// Public key the browser needs to create a subscription.
router.get("/vapid-public-key", async (req, res) => {
    try {
        const { publicKey } = await push.getVapid();
        res.json({ publicKey });
    } catch (err) {
        console.error("VAPID setup failed:", err.message);
        res.status(503).json({ message: "Push notifications aren't available right now." });
    }
});

router.use(protect);

const validSubscription = (s) =>
    s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" && typeof s.keys?.auth === "string";

router.post("/subscribe", async (req, res) => {
    const sub = req.body?.subscription;
    if (!validSubscription(sub)) return res.status(400).json({ message: "Invalid push subscription" });
    // The same browser re-subscribing (or switching accounts) takes over the endpoint.
    await PushSubscription.findOneAndUpdate(
        { endpoint: sub.endpoint },
        { userId: req.user._id, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, userAgent: String(req.get("user-agent") || "").slice(0, 300) },
        { upsert: true }
    );
    res.status(201).json({ message: "Subscribed" });
});

router.delete("/subscribe", async (req, res) => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== "string") return res.status(400).json({ message: "endpoint required" });
    await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
    res.json({ message: "Unsubscribed" });
});

router.get("/devices", async (req, res) => {
    res.json({ count: await PushSubscription.countDocuments({ userId: req.user._id }) });
});

router.post("/test", async (req, res) => {
    const { sent } = await push.sendToUser(req.user._id, {
        title: "Cognitive Firewall alerts are on",
        body: "This is how you'll hear about tilt warnings and Hard Locks, even with the app closed.",
        tag: "cf-test",
        url: "/",
    });
    if (!sent) return res.status(404).json({ message: "No devices are subscribed yet." });
    res.json({ sent });
});

module.exports = router;
