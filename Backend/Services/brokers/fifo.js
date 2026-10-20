// Turn a chronological list of fills into closed round-trip trades using
// FIFO lot matching. Handles longs, shorts, partial closes and flips.
//
// fill: { id, symbol, side: 'buy'|'sell', qty, price, time }
// returns: [{ externalId, instrument, direction, entryTime, exitTime, pnl, qty }]

const EPS = 1e-9; // fractional crypto quantities: treat dust as zero

function matchFills(fills) {
    const books = new Map(); // symbol -> [{ qty (signed), price, time }]
    const closed = [];

    for (const f of fills) {
        const qty = Number(f.qty);
        const price = Number(f.price);
        if (!(qty > 0) || !Number.isFinite(price)) continue;
        const signed = f.side === 'buy' ? qty : -qty;
        const lots = books.get(f.symbol) || [];
        let remaining = signed;
        let pnl = 0;
        let closedQty = 0;
        let earliest = null;
        let closingDirection = null;

        // Consume opposite-signed lots first (this fill reduces the position)
        while (remaining !== 0 && lots.length && Math.sign(lots[0].qty) !== Math.sign(remaining)) {
            const lot = lots[0];
            const take = Math.min(Math.abs(lot.qty), Math.abs(remaining));
            const isLong = lot.qty > 0;
            pnl += (isLong ? price - lot.price : lot.price - price) * take;
            closedQty += take;
            closingDirection = isLong ? 'buy' : 'sell';
            earliest = earliest && earliest < lot.time ? earliest : lot.time;
            lot.qty += isLong ? -take : take;
            remaining += isLong ? take : -take;
            if (Math.abs(lot.qty) < EPS) lots.shift();
            if (Math.abs(remaining) < EPS) remaining = 0;
        }

        if (closedQty > 0) {
            closed.push({
                externalId: String(f.id),
                instrument: f.symbol,
                direction: closingDirection,
                entryTime: new Date(earliest),
                exitTime: new Date(f.time),
                pnl: Math.round(pnl * 100) / 100,
                qty: closedQty,
            });
        }

        // Whatever is left opens (or adds to) a position
        if (remaining !== 0) lots.push({ qty: remaining, price, time: f.time });
        books.set(f.symbol, lots);
    }

    return closed;
}

module.exports = { matchFills };
