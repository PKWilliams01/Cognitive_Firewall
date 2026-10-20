const express = require("express");
const router = express.Router();
const BrokerConnection = require("../Models/BrokerConnection");
const { protect } = require("../Middleware/authMiddleware");
const secretBox = require("../Services/secretBox");
const { firewallState } = require("../Services/firewall");
const brokers = require("../Services/brokers");
const { parseCsv } = require("../Services/brokers/csvImport");

const SYNC_THROTTLE_MS = 2 * 60 * 1000;

// Credential fields each broker expects; anything else is ignored.
const CRED_FIELDS = {
    oanda: ["token", "accountId"],
    alpaca: ["keyId", "secret"],
    binance: ["apiKey", "secret"],
};
const HINT_FIELD = { oanda: "token", alpaca: "keyId", binance: "apiKey" };

const sanitise = (c) => ({
    _id: c._id,
    broker: c.broker,
    brokerName: brokers.connectors[c.broker]?.name,
    capabilities: brokers.connectors[c.broker]?.capabilities,
    environment: c.environment,
    label: c.label,
    accountId: c.accountId,
    keyHint: c.keyHint,
    enforceLock: c.enforceLock,
    lockActive: c.lockActive,
    lastLockAction: c.lastLockAction,
    status: c.status,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
    importedCount: c.importedCount,
    createdAt: c.createdAt,
});

const locked = (res) =>
    res.status(423).json({ code: "locked", message: "The firewall is locked. Broker settings can't be loosened until it reopens." });

const requireConfigured = (req, res, next) =>
    secretBox.isConfigured()
        ? next()
        : res.status(503).json({ code: "not_configured", message: "Broker connections aren't enabled on this server." });

router.use(protect);

router.get("/", async (req, res) => {
    const conns = await BrokerConnection.find({ userId: req.user._id }).sort({ createdAt: 1 });
    res.json({
        configured: secretBox.isConfigured(),
        connections: conns.map(sanitise),
    });
});

router.post("/", requireConfigured, async (req, res) => {
    const { broker, environment = "practice", credentials = {}, label } = req.body || {};
    const connector = brokers.connectors[broker];
    if (!connector) return res.status(400).json({ message: "Unsupported broker" });
    if (!["practice", "live"].includes(environment)) return res.status(400).json({ message: "Invalid environment" });

    const creds = {};
    for (const f of CRED_FIELDS[broker]) if (credentials[f]) creds[f] = String(credentials[f]).trim();

    let info;
    try {
        info = await connector.verify(creds, environment);
    } catch (err) {
        return res.status(400).json({ code: "verify_failed", message: brokers.brokerError(err) });
    }

    const exists = await BrokerConnection.findOne({ userId: req.user._id, broker, environment, accountId: info.accountId });
    if (exists) return res.status(409).json({ message: "That account is already connected" });

    const conn = await BrokerConnection.create({
        userId: req.user._id,
        broker,
        environment,
        accountId: info.accountId,
        label: String(label || info.label || connector.name).slice(0, 80),
        keyHint: secretBox.mask(creds[HINT_FIELD[broker]]),
        credentials: secretBox.seal(creds),
    });
    res.status(201).json(sanitise(conn));
});

router.patch("/:id", async (req, res) => {
    const conn = await BrokerConnection.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conn) return res.status(404).json({ message: "Connection not found" });

    if (req.body.label !== undefined) conn.label = String(req.body.label).slice(0, 80);
    if (req.body.enforceLock !== undefined) {
        const next = Boolean(req.body.enforceLock);
        if (!next && conn.enforceLock) {
            const state = await firewallState(req.user);
            if (state.isLocked) return locked(res);
        }
        conn.enforceLock = next;
    }
    await conn.save();
    if (conn.enforceLock) await brokers.reconcileLocksQuietly(req.user);
    res.json(sanitise(await BrokerConnection.findById(conn._id)));
});

router.delete("/:id", async (req, res) => {
    const conn = await BrokerConnection.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conn) return res.status(404).json({ message: "Connection not found" });
    if (conn.enforceLock) {
        const state = await firewallState(req.user);
        if (state.isLocked) return locked(res);
    }
    await conn.deleteOne();
    res.json({ message: "Disconnected" });
});

async function runSync(conn, res) {
    if (conn.lastSyncAt && Date.now() - conn.lastSyncAt.getTime() < SYNC_THROTTLE_MS) {
        return { id: conn._id, skipped: true, message: "Synced recently — try again in a couple of minutes" };
    }
    try {
        return { id: conn._id, ...(await brokers.syncConnection(conn)) };
    } catch (err) {
        return { id: conn._id, error: err.message };
    }
}

router.post("/sync", requireConfigured, async (req, res) => {
    const conns = await BrokerConnection.find({ userId: req.user._id });
    const results = [];
    for (const conn of conns) results.push(await runSync(conn));
    await brokers.reconcileLocksQuietly(req.user);
    res.json({ results });
});

router.post("/:id/sync", requireConfigured, async (req, res) => {
    const conn = await BrokerConnection.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conn) return res.status(404).json({ message: "Connection not found" });
    const result = await runSync(conn);
    await brokers.reconcileLocksQuietly(req.user);
    res.status(result.error ? 502 : 200).json(result);
});

// CSV import for MetaTrader 4/5 and prop-firm exports. No credentials involved.
router.post("/import/csv", express.json({ limit: "2mb" }), async (req, res) => {
    const { csv, utcOffsetMinutes = 0, format = "mt-csv" } = req.body || {};
    if (typeof csv !== "string" || !csv.trim()) return res.status(400).json({ message: "No CSV content provided" });
    const source = format === "csv" ? "csv" : "mt-csv";
    try {
        const { trades, skipped } = parseCsv(csv, { utcOffsetMinutes: Number(utcOffsetMinutes) || 0 });
        const added = await brokers.saveImportedTrades(req.user._id, source, trades);
        res.json({ parsed: trades.length, added, duplicates: trades.length - added, skipped: skipped.length });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;
module.exports.sanitise = sanitise;
