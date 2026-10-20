const axios = require("axios");

// OANDA v20 REST API. Practice and live use different fixed hosts.
const BASE = {
    practice: "https://api-fxpractice.oanda.com",
    live: "https://api-fxtrade.oanda.com",
};

const client = (creds, env) =>
    axios.create({
        baseURL: BASE[env],
        timeout: 15000,
        headers: { Authorization: `Bearer ${creds.token}`, "Accept-Datetime-Format": "RFC3339" },
    });

// EUR_USD -> EUR/USD, NAS100_USD -> NAS100, XAU_USD -> XAU/USD
const INDICES = new Set(["US30", "NAS100", "SPX500", "UK100", "DE30", "DE40", "JP225", "US2000", "AU200", "HK33", "FR40", "EU50"]);
const normaliseInstrument = (name = "") => {
    const [base, quote] = name.split("_");
    if (INDICES.has(base)) return base;
    return quote ? `${base}/${quote}` : base;
};

async function verify(creds, env) {
    if (!creds?.token) throw new Error("An OANDA API token is required");
    const api = client(creds, env);
    const { data } = await api.get("/v3/accounts");
    const ids = (data.accounts || []).map((a) => a.id);
    if (!ids.length) throw new Error("No OANDA accounts found for this token");
    const accountId = creds.accountId && ids.includes(creds.accountId) ? creds.accountId : ids[0];
    if (creds.accountId && accountId !== creds.accountId) throw new Error("That account ID isn't accessible with this token");
    const { data: summary } = await api.get(`/v3/accounts/${accountId}/summary`);
    return { accountId, label: summary.account?.alias || `OANDA ${accountId}`, currency: summary.account?.currency };
}

async function fetchClosedTrades(creds, env, { accountId, since }) {
    const { data } = await client(creds, env).get(`/v3/accounts/${accountId}/trades`, {
        params: { state: "CLOSED", count: 500 },
    });
    return (data.trades || [])
        .filter((t) => t.closeTime && new Date(t.closeTime) >= since)
        .map((t) => ({
            externalId: String(t.id),
            instrument: normaliseInstrument(t.instrument),
            direction: Number(t.initialUnits) >= 0 ? "buy" : "sell",
            entryTime: new Date(t.openTime),
            exitTime: new Date(t.closeTime),
            pnl: Number(t.realizedPL) || 0,
        }));
}

// OANDA has no "suspend trading" switch; the most we can do is cancel
// pending (not yet filled) orders. Open positions are never touched.
async function enforceLock(creds, env, { accountId }) {
    const api = client(creds, env);
    const { data } = await api.get(`/v3/accounts/${accountId}/pendingOrders`);
    const orders = data.orders || [];
    await Promise.all(orders.map((o) => api.put(`/v3/accounts/${accountId}/orders/${o.id}/cancel`)));
    return { type: "cancel_pending_orders", detail: `Cancelled ${orders.length} pending order${orders.length === 1 ? "" : "s"}` };
}

async function releaseLock() {
    return { type: "none", detail: "Nothing to release on OANDA" };
}

module.exports = {
    id: "oanda",
    name: "OANDA",
    capabilities: { import: true, blockNewOrders: false, cancelOrders: true },
    BASE,
    normaliseInstrument,
    verify,
    fetchClosedTrades,
    enforceLock,
    releaseLock,
};
