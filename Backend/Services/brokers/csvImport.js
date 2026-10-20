const crypto = require("crypto");

// Parses MetaTrader 4/5 and generic prop-firm trade-history exports.
const MAX_ROWS = 5000;

const ALIASES = {
    id: ["ticket", "position", "order", "deal", "id", "trade id", "trade #"],
    instrument: ["symbol", "item", "instrument", "market", "pair"],
    direction: ["type", "direction", "side", "action"],
    openTime: ["open time", "time", "entry time", "opened", "open date"],
    closeTime: ["close time", "exit time", "closed", "close date", "time_1"],
    profit: ["profit", "p/l", "pnl", "net profit", "profit/loss", "realized pnl"],
    commission: ["commission", "fees", "fee"],
    swap: ["swap", "rollover", "financing"],
};

function splitLine(line, delim) {
    const out = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
            else quoted = !quoted;
        } else if (c === delim && !quoted) { out.push(cur); cur = ""; }
        else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

function detectDelimiter(header) {
    const counts = [",", ";", "\t"].map((d) => [d, header.split(d).length]);
    return counts.sort((a, b) => b[1] - a[1])[0][0];
}

const num = (v) => {
    if (v === undefined || v === null || v === "") return 0;
    const n = Number(String(v).replace(/[\s,](?=\d{3}\b)/g, "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
};

// MT exports "2024.05.21 10:30:15" in broker server time; offset converts to UTC.
function parseTime(v, utcOffsetMinutes) {
    if (!v) return null;
    const m = String(v).match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
        const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
        return new Date(utc - utcOffsetMinutes * 60000);
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

function parseCsv(text, { utcOffsetMinutes = 0 } = {}) {
    const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("The file has no trade rows");
    if (lines.length - 1 > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS})`);

    const delim = detectDelimiter(lines[0]);
    const seen = {};
    const headers = splitLine(lines[0], delim).map((h) => {
        let k = h.toLowerCase();
        seen[k] = (seen[k] || 0) + 1;
        if (seen[k] > 1) k = `${k}_${seen[k] - 1}`; // MT5 has two "Time" columns
        return k;
    });
    const col = {};
    for (const [field, names] of Object.entries(ALIASES)) {
        col[field] = headers.findIndex((h) => names.includes(h));
    }
    if (col.instrument < 0 || col.profit < 0) throw new Error("Couldn't find Symbol and Profit columns");
    // MT5 "Time" ... "Time" layout: the second Time is the close.
    if (col.closeTime < 0 && col.openTime >= 0) col.closeTime = col.openTime;

    const trades = [];
    const skipped = [];
    lines.slice(1).forEach((line, i) => {
        const cells = splitLine(line, delim);
        const get = (f) => (col[f] >= 0 ? cells[col[f]] : undefined);
        const type = String(get("direction") || "").toLowerCase();
        if (type && !/buy|sell|long|short/.test(type)) { skipped.push(i + 2); return; } // balance/deposit rows
        const instrument = get("instrument");
        const exitTime = parseTime(get("closeTime"), utcOffsetMinutes);
        if (!instrument || !exitTime) { skipped.push(i + 2); return; }
        const entryTime = parseTime(get("openTime"), utcOffsetMinutes) || exitTime;
        const pnl = Math.round((num(get("profit")) + num(get("commission")) + num(get("swap"))) * 100) / 100;
        const id = get("id") || crypto.createHash("sha1").update(line).digest("hex").slice(0, 16);
        trades.push({
            externalId: String(id),
            instrument: instrument.toUpperCase(),
            direction: /sell|short/.test(type) ? "sell" : "buy",
            entryTime: entryTime <= exitTime ? entryTime : exitTime,
            exitTime,
            pnl,
        });
    });
    return { trades, skipped };
}

module.exports = { parseCsv, parseTime, MAX_ROWS };
