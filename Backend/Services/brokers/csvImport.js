const crypto = require("crypto");

// Parses trade-history exports: MetaTrader 4/5 HTML reports (what FTMO and
// most MT-based prop firms give you) and CSV from MT, prop firms and others.
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
    taxes: ["taxes", "tax"],
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

const TRADE_TYPE = /^(buy|sell|long|short)$/;

// Shared by the CSV and HTML paths: header cells + data rows -> trades.
function rowsToTrades(headerCells, rows, { utcOffsetMinutes = 0 } = {}) {
    const seen = {};
    const headers = headerCells.map((h) => {
        let k = h.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
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
    rows.forEach((cells, i) => {
        const get = (f) => (col[f] >= 0 ? cells[col[f]] : undefined);
        const type = String(get("direction") || "").toLowerCase().trim();
        // balance/deposit/credit rows and pending order types aren't trades
        if (type && !TRADE_TYPE.test(type)) { skipped.push(i + 2); return; }
        const instrument = get("instrument");
        const exitTime = parseTime(get("closeTime"), utcOffsetMinutes);
        if (!instrument || !exitTime) { skipped.push(i + 2); return; }
        const entryTime = parseTime(get("openTime"), utcOffsetMinutes) || exitTime;
        const pnl = Math.round((num(get("profit")) + num(get("commission")) + num(get("swap")) + num(get("taxes"))) * 100) / 100;
        const id = get("id") || crypto.createHash("sha1").update(cells.join("|")).digest("hex").slice(0, 16);
        trades.push({
            externalId: String(id),
            instrument: instrument.toUpperCase(),
            direction: /sell|short/.test(type) ? "sell" : "buy",
            entryTime: entryTime <= exitTime ? entryTime : exitTime,
            exitTime,
            pnl,
        });
    });
    if (trades.length > MAX_ROWS) throw new Error(`Too many trades (max ${MAX_ROWS})`);
    return { trades, skipped };
}

function parseCsv(text, opts = {}) {
    const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("The file has no trade rows");
    if (lines.length - 1 > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS})`);
    const delim = detectDelimiter(lines[0]);
    return rowsToTrades(splitLine(lines[0], delim), lines.slice(1).map((l) => splitLine(l, delim)), opts);
}

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
const cellText = (html) =>
    html.replace(/<[^>]*>/g, "").replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]).replace(/\s+/g, " ").trim();

// Table rows as cell arrays, with colspans expanded so columns stay aligned.
function htmlRows(html) {
    const rows = [];
    for (const [, tr] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [];
        for (const [, attrs, inner] of tr.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
            if (/class\s*=\s*["']?hidden/i.test(attrs)) continue; // MT5 hidden helper cells
            cells.push(cellText(inner));
            const span = Number((attrs.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1);
            for (let k = 1; k < span; k++) cells.push("");
        }
        if (cells.some(Boolean)) rows.push(cells);
    }
    return rows;
}

// Sections that follow closed trades in MT reports; stop before them.
const SECTION_END = /^(open trades|open positions|working orders|orders|deals|summary|results)\b/i;

function parseHtmlReport(html, opts = {}) {
    const rows = htmlRows(String(html));
    const isHeader = (r) => {
        const l = r.map((c) => c.toLowerCase());
        return l.some((c) => ALIASES.instrument.includes(c)) && l.some((c) => ALIASES.profit.includes(c));
    };
    const start = rows.findIndex(isHeader);
    if (start < 0) throw new Error("Couldn't find a closed-trades table in this report");
    const header = rows[start];
    const body = [];
    for (const r of rows.slice(start + 1)) {
        const filled = r.filter(Boolean);
        if (filled.length === 1 && SECTION_END.test(filled[0])) break;
        if (isHeader(r)) break;
        if (filled.length >= 4) body.push(r);
    }
    return rowsToTrades(header, body, opts);
}

// Auto-detects HTML (MT "Save as Report") vs CSV.
function parseStatement(text, opts = {}) {
    const s = String(text).replace(/^\uFEFF/, "");
    return /<table[\s>]/i.test(s) ? parseHtmlReport(s, opts) : parseCsv(s, opts);
}

module.exports = { parseCsv, parseHtmlReport, parseStatement, parseTime, MAX_ROWS };
