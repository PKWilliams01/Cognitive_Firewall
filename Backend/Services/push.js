const webpush = require("web-push");
const AppConfig = require("../Models/AppConfig");
const PushSubscription = require("../Models/PushSubscription");
const User = require("../Models/User");

// VAPID keys identify this server to the browser push services. Use the env
// pair if set; otherwise generate one on first use and keep it in the DB so it
// survives restarts (rotating it would silently break every subscription).
let vapidPromise = null;
function getVapid() {
    if (!vapidPromise) {
        vapidPromise = (async () => {
            let keys;
            if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
                keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
            } else {
                const saved = await AppConfig.findOne({ key: "vapid" }).lean();
                if (saved?.value?.publicKey) keys = saved.value;
                else {
                    keys = webpush.generateVAPIDKeys();
                    // Another instance may have raced us; keep whichever landed first.
                    await AppConfig.updateOne({ key: "vapid" }, { $setOnInsert: { value: keys } }, { upsert: true });
                    keys = (await AppConfig.findOne({ key: "vapid" }).lean()).value;
                }
            }
            const subject = process.env.VAPID_SUBJECT || "mailto:admin@cognitive-firewall.app";
            webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
            return keys;
        })().catch((err) => { vapidPromise = null; throw err; });
    }
    return vapidPromise;
}

// Sends to every device the user enabled; prunes subscriptions the push
// service reports as gone (uninstalled app, revoked permission).
async function sendToUser(userId, payload) {
    const subs = await PushSubscription.find({ userId }).lean();
    if (!subs.length) return { sent: 0 };
    await getVapid();
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 60 * 60 });
            sent += 1;
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id });
            else console.error("Push failed:", err.statusCode || err.message);
        }
    }));
    return { sent };
}

const RANK = { calm: 0, warn: 1, high: 2, locked: 3 };

function levelOf(state) {
    if (state.isLocked) return "locked";
    const warnings = state.warnings || [];
    if ((state.revengeRisk || 0) >= 75 || warnings.some((w) => w.severity === "high")) return "high";
    if ((state.revengeRisk || 0) >= 50 || warnings.some((w) => w.code?.startsWith("prop_"))) return "warn";
    return "calm";
}

const LOCK_TITLES = {
    revenge: "Hard Lock engaged",
    daily_limit: "Daily trade limit reached",
    prop_daily: "Daily loss guard engaged",
    prop_max: "Account guard engaged",
};

function messageFor(level, state) {
    if (level === "locked") {
        const until = state.lockedUntil ? ` until ${new Date(state.lockedUntil).toUTCString().slice(17, 22)} UTC` : "";
        return {
            title: LOCK_TITLES[state.lockReason] || "Firewall locked",
            body: `Execution is locked${until}. Step away from the screen. The trade you want to take now is the one to skip.`,
            tag: "cf-lock",
            url: "/?action=execute",
        };
    }
    const top = (state.warnings || []).find((w) => w.severity === "high") || (state.warnings || [])[0];
    if (level === "high") {
        return { title: `Red alert: revenge risk ${state.revengeRisk}%`, body: top?.message || "You're close to the Hard Lock. Slow down before the next entry.", tag: "cf-risk", url: "/" };
    }
    return { title: `Tilt rising: revenge risk ${state.revengeRisk}%`, body: top?.message || "Your recent pattern looks reactive. Re-check your plan.", tag: "cf-risk", url: "/" };
}

// Pending "firewall reopened" timers for timed cool-offs, keyed by user id.
// In-memory only: lost on restart, so the next metrics fetch also catches up.
const unlockTimers = new Map();

function scheduleUnlockNotice(user, lockedUntil) {
    const id = String(user._id);
    clearTimeout(unlockTimers.get(id));
    const ms = new Date(lockedUntil).getTime() - Date.now();
    if (!(ms > 0) || ms > 24 * 60 * 60 * 1000) return;
    unlockTimers.set(id, setTimeout(async () => {
        unlockTimers.delete(id);
        try {
            const { firewallState } = require("./firewall");
            const fresh = await User.findById(id);
            if (fresh) await notifyTransitions(fresh, await firewallState(fresh));
        } catch (err) {
            console.error("Unlock notice failed:", err.message);
        }
    }, ms + 5000));
    unlockTimers.get(id).unref?.();
}

// Pushes only when the firewall level changes, so polling the dashboard
// doesn't spam: rising level -> alert, lock lifted -> "reopened".
async function notifyTransitions(user, state) {
    const prev = user.pushLevel || "calm";
    const next = levelOf(state);
    const lockKey = next === "locked" ? `${state.lockReason}|${state.lockedUntil || ""}` : undefined;
    const sameLock = next === "locked" && prev === "locked" && user.pushLockKey === lockKey;
    if (next === prev && (next !== "locked" || sameLock)) return null;

    await User.updateOne({ _id: user._id }, { pushLevel: next, pushLockKey: lockKey });
    user.pushLevel = next;
    user.pushLockKey = lockKey;

    let payload = null;
    if (next === "locked") {
        payload = messageFor(next, state);
        if (state.lockedUntil) scheduleUnlockNotice(user, state.lockedUntil);
    } else if (prev === "locked") {
        payload = { title: "Firewall reopened", body: "Your cool-off is over. Trade your plan, not your feelings.", tag: "cf-lock", url: "/" };
    } else if (RANK[next] > RANK[prev]) {
        payload = messageFor(next, state);
    }
    if (payload) await sendToUser(user._id, payload);
    return payload;
}

// Never let a push problem break the request that triggered it.
function notifyQuietly(user, state) {
    if (!user?._id) return;
    notifyTransitions(user, state).catch((err) => console.error("Push notify failed:", err.message));
}

module.exports = { getVapid, sendToUser, notifyTransitions, notifyQuietly, levelOf };
