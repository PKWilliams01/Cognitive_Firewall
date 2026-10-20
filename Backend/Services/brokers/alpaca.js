const axios = require("axios");
const { matchFills } = require("./fifo");

// Alpaca Trading API. Paper and live use different fixed hosts.
const BASE = {
    practice: "https://paper-api.alpaca.markets",
    live: "https://api.alpaca.markets",
};

const client = (creds, env) =>
    axios.create({
        baseURL: BASE[env],
        timeout: 15000,
        headers: { "APCA-API-KEY-ID": creds.keyId, "APCA-API-SECRET-KEY": creds.secret },
    });

async function verify(creds, env) {
    if (!creds?.keyId || !creds?.secret) throw new Error("An Alpaca key ID and secret are required");
    const { data } = await client(creds, env).get("/v2/account");
    return { accountId: data.account_number || data.id, label: `Alpaca ${data.account_number || ""}`.trim(), currency: data.currency };
}

// Alpaca reports individual fills, so round trips are rebuilt with FIFO matching.
async function fetchClosedTrades(creds, env, { since }) {
    const api = client(creds, env);
    const fills = [];
    let pageToken;
    for (let page = 0; page < 20; page++) {
        const { data } = await api.get("/v2/account/activities/FILL", {
            params: { after: since.toISOString(), direction: "asc", page_size: 100, ...(pageToken && { page_token: pageToken }) },
        });
        if (!Array.isArray(data) || !data.length) break;
        fills.push(...data);
        if (data.length < 100) break;
        pageToken = data[data.length - 1].id;
    }
    return matchFills(
        fills.map((f) => ({
            id: String(f.id),
            symbol: f.symbol,
            side: f.side === "buy" ? "buy" : "sell",
            qty: Number(f.qty),
            price: Number(f.price),
            time: f.transaction_time,
        }))
    );
}

// Alpaca supports a true account-level block: suspend_trade rejects all new orders.
async function enforceLock(creds, env) {
    const api = client(creds, env);
    await api.patch("/v2/account/configurations", { suspend_trade: true });
    await api.delete("/v2/orders");
    return { type: "suspend_trade", detail: "Trading suspended and open orders cancelled" };
}

async function releaseLock(creds, env) {
    await client(creds, env).patch("/v2/account/configurations", { suspend_trade: false });
    return { type: "resume_trade", detail: "Trading re-enabled" };
}

module.exports = {
    id: "alpaca",
    name: "Alpaca",
    capabilities: { import: true, blockNewOrders: true, cancelOrders: true },
    BASE,
    verify,
    fetchClosedTrades,
    enforceLock,
    releaseLock,
};
