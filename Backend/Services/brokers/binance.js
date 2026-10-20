const axios = require("axios");
const crypto = require("crypto");

// Binance USDⓈ-M futures. Testnet and live use different fixed hosts.
const BASE = {
    practice: "https://testnet.binancefuture.com",
    live: "https://fapi.binance.com",
};

function signedRequest(creds, env, method, path, params = {}) {
    const query = new URLSearchParams({ ...params, recvWindow: 5000, timestamp: Date.now() }).toString();
    const signature = crypto.createHmac("sha256", creds.secret).update(query).digest("hex");
    return axios({
        method,
        url: `${BASE[env]}${path}?${query}&signature=${signature}`,
        timeout: 15000,
        headers: { "X-MBX-APIKEY": creds.apiKey },
    }).then((r) => r.data);
}

async function verify(creds, env) {
    if (!creds?.apiKey || !creds?.secret) throw new Error("A Binance API key and secret are required");
    const data = await signedRequest(creds, env, "get", "/fapi/v2/account");
    if (data && data.canTrade === undefined && !data.assets) throw new Error("Unexpected Binance response");
    return { accountId: `futures-${creds.apiKey.slice(0, 8)}`, label: "Binance Futures", currency: "USDT" };
}

// Realised P/L entries are the closest thing Binance has to "closed trades".
// The opening time isn't reported, so entry = exit (duration counts as unknown).
async function fetchClosedTrades(creds, env, { since }) {
    const income = await signedRequest(creds, env, "get", "/fapi/v1/income", {
        incomeType: "REALIZED_PNL",
        startTime: since.getTime(),
        limit: 1000,
    });
    const trades = [];
    const sideCache = {};
    for (const row of income || []) {
        const key = `${row.symbol}:${row.tradeId}`;
        if (!(key in sideCache) && row.tradeId) {
            try {
                const fills = await signedRequest(creds, env, "get", "/fapi/v1/userTrades", {
                    symbol: row.symbol,
                    fromId: row.tradeId,
                    limit: 1,
                });
                // A sell fill closes a long; a buy fill closes a short.
                sideCache[key] = fills?.[0]?.side === "BUY" ? "sell" : "buy";
            } catch {
                sideCache[key] = "buy";
            }
        }
        const at = new Date(Number(row.time));
        trades.push({
            externalId: String(row.tranId || key),
            instrument: row.symbol,
            direction: sideCache[key] || "buy",
            entryTime: at,
            exitTime: at,
            pnl: Number(row.income) || 0,
        });
    }
    return trades;
}

// Binance has no account-level suspend; cancel open orders on every symbol.
async function enforceLock(creds, env) {
    const orders = await signedRequest(creds, env, "get", "/fapi/v1/openOrders");
    const symbols = [...new Set((orders || []).map((o) => o.symbol))];
    for (const symbol of symbols) await signedRequest(creds, env, "delete", "/fapi/v1/allOpenOrders", { symbol });
    return { type: "cancel_open_orders", detail: `Cancelled ${(orders || []).length} open order(s) across ${symbols.length} symbol(s)` };
}

async function releaseLock() {
    return { type: "none", detail: "Nothing to release on Binance" };
}

module.exports = {
    id: "binance",
    name: "Binance Futures",
    capabilities: { import: true, blockNewOrders: false, cancelOrders: true },
    BASE,
    verify,
    fetchClosedTrades,
    enforceLock,
    releaseLock,
};
