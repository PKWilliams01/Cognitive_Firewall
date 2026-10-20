// Instruments offered in the pre-flight (grouped for the picker).
export const INSTRUMENT_GROUPS = [
  { group: 'Forex', items: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CAD'] },
  { group: 'Metals', items: [{ value: 'XAU/USD', label: 'XAU/USD (Gold)' }, { value: 'XAG/USD', label: 'XAG/USD (Silver)' }] },
  { group: 'Indices', items: [{ value: 'US30', label: 'US30 (Dow Jones)' }, { value: 'NAS100', label: 'NAS100 (Nasdaq)' }, { value: 'SPX500', label: 'SPX500 (S&P 500)' }] },
  { group: 'Crypto', items: [{ value: 'BTC/USD', label: 'BTC/USD (Bitcoin)' }, { value: 'ETH/USD', label: 'ETH/USD (Ethereum)' }] },
];

export const normaliseItem = (item) => (typeof item === 'string' ? { value: item, label: item } : item);
