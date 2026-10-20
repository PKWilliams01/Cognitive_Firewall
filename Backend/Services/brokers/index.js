const Trade = require("../../Models/Trade");
const BrokerConnection = require("../../Models/BrokerConnection");
const secretBox = require("../secretBox");
const { firewallState } = require("../firewall");

const connectors = {
    oanda: require("./oanda"),
    alpaca: require("./alpaca"),
    binance: require("./binance"),
};

const DAY = 24 * 60 * 60 * 1000;

const resultOf = (pnl) => (pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven");

// Imports are facts: they're always recorded, but never pre-claim plan
// adherence. The trader reviews them afterwards in the journal.
async function saveImportedTrades(userId, source, trades) {
    if (!trades.length) return 0;
    const ops = trades.map((t) => ({
        updateOne: {
            filter: { userId, source, externalId: t.externalId },
            update: {
                $setOnInsert: {
                    userId,
                    source,
                    externalId: t.externalId,
                    instrument: t.instrument,
                    direction: t.direction,
                    entryTime: t.entryTime,
                    exitTime: t.exitTime,
                    pnl: t.pnl,
                    result: resultOf(t.pnl),
                    followedPlan: false,
                    needsReview: true,
                    mood: "Neutral",
                },
            },
            upsert: true,
        },
    }));
    const res = await Trade.bulkWrite(ops, { ordered: false });
    return res.upsertedCount || 0;
}

async function syncConnection(conn) {
    const connector = connectors[conn.broker];
    const creds = secretBox.open(conn.credentials);
    const since = conn.lastSyncAt ? new Date(conn.lastSyncAt.getTime() - DAY) : new Date(Date.now() - 90 * DAY);
    try {
        const trades = await connector.fetchClosedTrades(creds, conn.environment, { accountId: conn.accountId, since });
        const added = await saveImportedTrades(conn.userId, conn.broker, trades);
        conn.status = "connected";
        conn.lastError = undefined;
        conn.lastSyncAt = new Date();
        conn.importedCount = (conn.importedCount || 0) + added;
        await conn.save();
        return { added, fetched: trades.length };
    } catch (err) {
        conn.status = "error";
        conn.lastError = brokerError(err);
        await conn.save();
        throw Object.assign(new Error(conn.lastError), { status: 502 });
    }
}

// Mirror the server-side lock onto connected broker accounts that opted in.
async function reconcileLocks(user, state) {
    const conns = await BrokerConnection.find({ userId: user._id, enforceLock: true });
    if (!conns.length) return [];
    const fw = state || (await firewallState(user));
    const results = [];
    for (const conn of conns) {
        const shouldLock = !!fw.isLocked;
        if (shouldLock === !!conn.lockActive) continue;
        const connector = connectors[conn.broker];
        try {
            const creds = secretBox.open(conn.credentials);
            const action = shouldLock
                ? await connector.enforceLock(creds, conn.environment, { accountId: conn.accountId })
                : await connector.releaseLock(creds, conn.environment, { accountId: conn.accountId });
            conn.lockActive = shouldLock;
            conn.lastLockAction = { ...action, at: new Date(), ok: true };
        } catch (err) {
            conn.lastLockAction = { type: shouldLock ? "enforce" : "release", at: new Date(), ok: false, detail: brokerError(err) };
        }
        await conn.save();
        results.push({ id: conn._id, ...conn.lastLockAction });
    }
    return results;
}

// Fire-and-forget wrapper so a broker outage never breaks the core app.
function reconcileLocksQuietly(user, state) {
    return reconcileLocks(user, state).catch((err) => {
        console.error("Broker lock reconcile failed:", err.message);
        return [];
    });
}

function brokerError(err) {
    const status = err.response?.status;
    const msg = err.response?.data?.errorMessage || err.response?.data?.message || err.response?.data?.msg || err.message;
    if (status === 401 || status === 403) return "The broker rejected these credentials";
    return String(msg || "Broker request failed").slice(0, 200);
}

module.exports = { connectors, saveImportedTrades, syncConnection, reconcileLocks, reconcileLocksQuietly, brokerError };
