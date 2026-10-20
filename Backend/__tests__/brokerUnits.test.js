jest.mock('axios');
const axios = require('axios');
const { matchFills } = require('../Services/brokers/fifo');
const { parseCsv } = require('../Services/brokers/csvImport');
const secretBox = require('../Services/secretBox');
const oanda = require('../Services/brokers/oanda');
const alpaca = require('../Services/brokers/alpaca');
const binance = require('../Services/brokers/binance');

const t = (min) => new Date(Date.UTC(2026, 0, 5, 10, min)).toISOString();

describe('secretBox', () => {
  beforeAll(() => { process.env.BROKER_ENCRYPTION_KEY = 'unit-test-key'; });

  test('round-trips and never stores plaintext', () => {
    const box = secretBox.seal({ token: 'super-secret-token' });
    expect(box.data).not.toContain('super-secret');
    expect(secretBox.open(box)).toEqual({ token: 'super-secret-token' });
  });

  test('rejects tampered ciphertext', () => {
    const box = secretBox.seal({ a: 1 });
    box.tag = Buffer.alloc(16).toString('base64');
    expect(() => secretBox.open(box)).toThrow();
  });

  test('masks secrets', () => {
    expect(secretBox.mask('abcdefghijkl')).toBe('abcd…ijkl');
    expect(secretBox.mask('short')).toBe('••••');
  });

  test('refuses to work without a key', () => {
    const k = process.env.BROKER_ENCRYPTION_KEY;
    delete process.env.BROKER_ENCRYPTION_KEY;
    expect(secretBox.isConfigured()).toBe(false);
    expect(() => secretBox.seal({})).toThrow(/BROKER_ENCRYPTION_KEY/);
    process.env.BROKER_ENCRYPTION_KEY = k;
  });
});

describe('FIFO fill matching', () => {
  test('long round trip', () => {
    const [trade, ...rest] = matchFills([
      { id: '1', symbol: 'AAPL', side: 'buy', qty: 10, price: 100, time: t(0) },
      { id: '2', symbol: 'AAPL', side: 'sell', qty: 10, price: 105, time: t(30) },
    ]);
    expect(rest).toHaveLength(0);
    expect(trade).toMatchObject({ externalId: '2', instrument: 'AAPL', direction: 'buy', pnl: 50 });
    expect(new Date(trade.entryTime).toISOString()).toBe(t(0));
  });

  test('short round trip and partial closes', () => {
    const trades = matchFills([
      { id: '1', symbol: 'TSLA', side: 'sell', qty: 5, price: 200, time: t(0) },
      { id: '2', symbol: 'TSLA', side: 'buy', qty: 2, price: 190, time: t(5) },
      { id: '3', symbol: 'TSLA', side: 'buy', qty: 3, price: 210, time: t(9) },
    ]);
    expect(trades.map((x) => [x.direction, x.pnl])).toEqual([['sell', 20], ['sell', -30]]);
  });

  test('position flip opens the opposite side with the leftover', () => {
    const trades = matchFills([
      { id: '1', symbol: 'X', side: 'buy', qty: 1, price: 10, time: t(0) },
      { id: '2', symbol: 'X', side: 'sell', qty: 3, price: 12, time: t(1) },
      { id: '3', symbol: 'X', side: 'buy', qty: 2, price: 11, time: t(2) },
    ]);
    expect(trades.map((x) => [x.direction, x.pnl])).toEqual([['buy', 2], ['sell', 2]]);
  });

  test('fractional crypto quantities close cleanly', () => {
    const trades = matchFills([
      { id: '1', symbol: 'BTC', side: 'buy', qty: 0.3, price: 100, time: t(0) },
      { id: '2', symbol: 'BTC', side: 'sell', qty: 0.1, price: 110, time: t(1) },
      { id: '3', symbol: 'BTC', side: 'sell', qty: 0.2, price: 110, time: t(2) },
      { id: '4', symbol: 'BTC', side: 'sell', qty: 0.1, price: 100, time: t(3) },
      { id: '5', symbol: 'BTC', side: 'buy', qty: 0.1, price: 90, time: t(4) },
    ]);
    expect(trades.map((x) => x.direction)).toEqual(['buy', 'buy', 'sell']);
    expect(trades[2].pnl).toBe(1);
  });
});

describe('CSV import', () => {
  test('MetaTrader 4 export with balance rows, commission and swap', () => {
    const csv = [
      'Ticket,Open Time,Type,Size,Item,Price,Close Time,Commission,Swap,Profit',
      '1001,2024.05.21 10:30:15,buy,0.10,eurusd,1.0850,2024.05.21 11:00:00,-0.70,0,25.00',
      '1002,2024.05.21 12:00:00,balance,,,,2024.05.21 12:00:00,0,0,500.00',
      '1003,2024.05.21 13:00:00,sell,0.10,gbpusd,1.27,2024.05.21 13:20:00,-0.70,-1.30,-10.00',
    ].join('\n');
    const { trades, skipped } = parseCsv(csv, { utcOffsetMinutes: 180 });
    expect(skipped).toHaveLength(1);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ externalId: '1001', instrument: 'EURUSD', direction: 'buy', pnl: 24.3 });
    expect(trades[0].entryTime.toISOString()).toBe('2024-05-21T07:30:15.000Z');
    expect(trades[1]).toMatchObject({ direction: 'sell', pnl: -12 });
  });

  test('MT5 semicolon export with duplicate Time columns', () => {
    const csv = 'Time;Position;Symbol;Type;Volume;Price;Time;Price;Commission;Swap;Profit\n2024.06.01 09:00:00;55;XAUUSD;sell;0.01;2300;2024.06.01 09:45:00;2290;0;0;10';
    const { trades } = parseCsv(csv);
    expect(trades[0]).toMatchObject({ externalId: '55', instrument: 'XAUUSD', direction: 'sell', pnl: 10 });
    expect(trades[0].exitTime.toISOString()).toBe('2024-06-01T09:45:00.000Z');
  });

  test('rejects files without the required columns', () => {
    expect(() => parseCsv('a,b\n1,2')).toThrow(/Symbol and Profit/);
  });
});

describe('connectors (mocked HTTP)', () => {
  beforeEach(() => jest.resetAllMocks());

  test('OANDA maps closed trades and only cancels pending orders on lock', async () => {
    const api = { get: jest.fn(), put: jest.fn().mockResolvedValue({}) };
    axios.create.mockReturnValue(api);
    api.get.mockResolvedValueOnce({ data: { trades: [
      { id: '7', instrument: 'NAS100_USD', initialUnits: '-2', openTime: t(0), closeTime: t(10), realizedPL: '-12.5' },
      { id: '8', instrument: 'EUR_USD', initialUnits: '1000', openTime: t(0), closeTime: '2020-01-01T00:00:00Z', realizedPL: '1' },
    ] } });
    const trades = await oanda.fetchClosedTrades({ token: 'x' }, 'practice', { accountId: 'A', since: new Date(t(0)) });
    expect(trades).toEqual([expect.objectContaining({ externalId: '7', instrument: 'NAS100', direction: 'sell', pnl: -12.5 })]);
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://api-fxpractice.oanda.com' }));

    api.get.mockResolvedValueOnce({ data: { orders: [{ id: '1' }, { id: '2' }] } });
    const action = await oanda.enforceLock({ token: 'x' }, 'practice', { accountId: 'A' });
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(action.type).toBe('cancel_pending_orders');
  });

  test('Alpaca suspends trading on lock and resumes on release', async () => {
    const api = { get: jest.fn(), patch: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}) };
    axios.create.mockReturnValue(api);
    await alpaca.enforceLock({ keyId: 'k', secret: 's' }, 'practice');
    expect(api.patch).toHaveBeenCalledWith('/v2/account/configurations', { suspend_trade: true });
    expect(api.delete).toHaveBeenCalledWith('/v2/orders');
    await alpaca.releaseLock({ keyId: 'k', secret: 's' }, 'practice');
    expect(api.patch).toHaveBeenLastCalledWith('/v2/account/configurations', { suspend_trade: false });
  });

  test('Alpaca rebuilds trades from fills', async () => {
    const api = { get: jest.fn().mockResolvedValue({ data: [
      { id: 'f1', symbol: 'SPY', side: 'buy', qty: '2', price: '500', transaction_time: t(0) },
      { id: 'f2', symbol: 'SPY', side: 'sell', qty: '2', price: '498', transaction_time: t(5) },
    ] }) };
    axios.create.mockReturnValue(api);
    const trades = await alpaca.fetchClosedTrades({ keyId: 'k', secret: 's' }, 'practice', { since: new Date(0) });
    expect(trades).toEqual([expect.objectContaining({ externalId: 'f2', pnl: -4, direction: 'buy' })]);
  });

  test('Binance signs requests and cancels open orders per symbol', async () => {
    axios.mockImplementation(({ url }) => {
      if (url.includes('/openOrders')) return Promise.resolve({ data: [{ symbol: 'BTCUSDT' }, { symbol: 'BTCUSDT' }, { symbol: 'ETHUSDT' }] });
      return Promise.resolve({ data: {} });
    });
    const action = await binance.enforceLock({ apiKey: 'K', secret: 'S' }, 'practice');
    const calls = axios.mock.calls.map(([c]) => c);
    expect(calls.every((c) => c.url.startsWith('https://testnet.binancefuture.com') && /signature=[0-9a-f]{64}/.test(c.url))).toBe(true);
    expect(calls.filter((c) => c.method === 'delete')).toHaveLength(2);
    expect(action.type).toBe('cancel_open_orders');
  });
});

describe('MetaTrader HTML reports (FTMO and other MT prop firms)', () => {
  const { parseHtmlReport, parseStatement } = require('../Services/brokers/csvImport');

  test('MT4 detailed statement: closed trades only, fees included', () => {
    const html = `<html><body><table>
      <tr><td colspan="14"><b>Closed Transactions:</b></td></tr>
      <tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
      <tr><td>5001</td><td>2024.05.21 10:30</td><td>buy</td><td>1.00</td><td>eurusd</td><td>1.0850</td><td>0</td><td>0</td><td>2024.05.21 11:00</td><td>1.0870</td><td>-7.00</td><td>0.00</td><td>-1.00</td><td>200.00</td></tr>
      <tr><td>5002</td><td>2024.05.21 12:00</td><td>balance</td><td colspan="10">Deposit</td><td>100&nbsp;000.00</td></tr>
      <tr><td>5003</td><td>2024.05.21 13:00</td><td>buy limit</td><td>1.00</td><td>gbpusd</td><td>1.2</td><td>0</td><td>0</td><td>2024.05.21 13:30</td><td>1.2</td><td colspan="3">cancelled</td><td>0</td></tr>
      <tr><td colspan="14"><b>Open Trades:</b></td></tr>
      <tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>&nbsp;</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
      <tr><td>6000</td><td>2024.05.22 09:00</td><td>sell</td><td>1.00</td><td>usdjpy</td><td>155</td><td>0</td><td>0</td><td>&nbsp;</td><td>154</td><td>0</td><td>0</td><td>0</td><td>50.00</td></tr>
    </table></body></html>`;
    const { trades } = parseStatement(html);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ externalId: '5001', instrument: 'EURUSD', direction: 'buy', pnl: 192 });
  });

  test('MT5 report: reads the Positions section, stops before Orders/Deals', () => {
    const html = `<table>
      <tr><th colspan="13"><b>Positions</b></th></tr>
      <tr><td>Time</td><td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>Price</td><td>Commission</td><td>Swap</td><td>Profit</td></tr>
      <tr><td>2024.06.03 08:00:05</td><td>777</td><td>US30.cash</td><td>sell</td><td>0.5</td><td>38500</td><td></td><td></td><td>2024.06.03 08:20:00</td><td>38450</td><td>0</td><td>0</td><td>25.00</td></tr>
      <tr><th colspan="13"><b>Orders</b></th></tr>
      <tr><td>Open Time</td><td>Order</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>State</td><td>Comment</td></tr>
      <tr><td>2024.06.03 08:00:05</td><td>778</td><td>US30.cash</td><td>sell</td><td>0.5</td><td>38500</td><td></td><td></td><td>2024.06.03 08:00:05</td><td>filled</td><td></td></tr>
    </table>`;
    const { trades } = parseHtmlReport(html, { utcOffsetMinutes: 180 });
    expect(trades).toEqual([expect.objectContaining({ externalId: '777', instrument: 'US30.CASH', direction: 'sell', pnl: 25 })]);
    expect(trades[0].exitTime.toISOString()).toBe('2024-06-03T05:20:00.000Z');
  });

  test('explains when there is no trades table', () => {
    expect(() => parseStatement('<table><tr><td>hello</td></tr></table>')).toThrow(/closed-trades table/);
  });
});
