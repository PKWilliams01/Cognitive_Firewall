import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plug, RefreshCw, Trash2, Upload, ShieldAlert, ShieldCheck, Plus, X } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useToast } from './Toast';
import './BrokerConnections.css';

// Credential fields per broker. Keys are only ever sent to our server,
// which verifies them, encrypts them, and never returns them.
const BROKERS = {
  oanda: {
    name: 'OANDA',
    blurb: 'Forex & CFDs via the v20 API.',
    envLabels: { practice: 'Practice', live: 'Live' },
    fields: [
      { key: 'token', label: 'Personal access token', secret: true },
      { key: 'accountId', label: 'Account ID (optional)', placeholder: '101-004-1234567-001' },
    ],
    lock: 'Cancels pending orders when the lock engages. OANDA has no account-level block, so open positions and new manual orders are not stopped.',
  },
  alpaca: {
    name: 'Alpaca',
    blurb: 'US stocks & crypto.',
    envLabels: { practice: 'Paper', live: 'Live' },
    fields: [
      { key: 'keyId', label: 'API key ID' },
      { key: 'secret', label: 'Secret key', secret: true },
    ],
    lock: 'Suspends trading on the account (new orders are rejected by Alpaca) and cancels open orders. Released automatically when the firewall reopens.',
  },
  binance: {
    name: 'Binance Futures',
    blurb: 'USDⓈ-M perpetual futures.',
    envLabels: { practice: 'Testnet', live: 'Live' },
    fields: [
      { key: 'apiKey', label: 'API key' },
      { key: 'secret', label: 'Secret key', secret: true },
    ],
    lock: 'Cancels open orders on every symbol. Binance has no account-level block, so new orders placed directly on Binance are not stopped.',
  },
};

const timeAgo = (d) => {
  if (!d) return 'never';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

export default function BrokerConnections() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, configured: false, connections: [] });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/brokers');
      setState({ loading: false, configured: Boolean(data?.configured), connections: Array.isArray(data?.connections) ? data.connections : [] });
    } catch (err) {
      setState((s) => ({ ...s, loading: false }));
      toast.error(errorMessage(err, 'Could not load broker connections'));
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const replace = (conn) => setState((s) => ({ ...s, connections: s.connections.map((c) => (c._id === conn._id ? conn : c)) }));

  const toggleLock = async (conn) => {
    try {
      const { data } = await api.patch(`/api/brokers/${conn._id}`, { enforceLock: !conn.enforceLock });
      replace(data);
      toast.success(data.enforceLock ? `Hard Lock will now act on ${data.label}` : 'Broker lock enforcement turned off');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the connection'));
    }
  };

  const sync = async (conn) => {
    try {
      const { data } = await api.post(`/api/brokers/${conn._id}/sync`);
      if (data.skipped) toast.info(data.message);
      else toast.success(data.added ? `Imported ${data.added} new trade${data.added === 1 ? '' : 's'} for review` : 'Up to date — no new trades');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Sync failed'));
      load();
    }
  };

  const remove = async (conn) => {
    try {
      await api.delete(`/api/brokers/${conn._id}`);
      setState((s) => ({ ...s, connections: s.connections.filter((c) => c._id !== conn._id) }));
      toast.success(`${conn.label} disconnected. Imported trades stay in your journal.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not disconnect'));
    }
  };

  return (
    <div className="brokers">
      {state.loading ? (
        <p className="settings-hint">Loading connections…</p>
      ) : (
        <>
          {!state.configured && (
            <div className="brokers-banner">
              <ShieldAlert size={16} /> Live broker connections aren't enabled on this server yet. CSV import still works.
            </div>
          )}

          {state.connections.length > 0 && (
            <ul className="brokers-list">
              {state.connections.map((c) => (
                <li key={c._id} className="brokers-item">
                  <div className="brokers-item-head">
                    <span className={`brokers-dot ${c.status === 'error' ? 'is-error' : ''}`} aria-hidden />
                    <div className="brokers-item-title">
                      <strong>{c.label}</strong>
                      <span className="mono">
                        {BROKERS[c.broker]?.envLabels[c.environment] || c.environment} · {c.keyHint} · synced {timeAgo(c.lastSyncAt)} · {c.importedCount} imported
                      </span>
                    </div>
                    <span className={`badge ${c.environment === 'live' ? 'badge-down' : ''}`}>{c.environment === 'live' ? 'LIVE' : 'DEMO'}</span>
                  </div>
                  {c.lastError && <p className="brokers-error">{c.lastError}</p>}

                  <label className="toggle-row">
                    <span>
                      <span className="toggle-title">Enforce Hard Lock on this account</span>
                      <span className="toggle-desc">{BROKERS[c.broker]?.lock}</span>
                    </span>
                    <span className={`toggle ${c.enforceLock ? 'is-on' : ''}`}>
                      <input type="checkbox" role="switch" checked={c.enforceLock} onChange={() => toggleLock(c)} aria-label={`Enforce Hard Lock on ${c.label}`} />
                      <span className="toggle-knob" />
                    </span>
                  </label>
                  {c.lockActive && (
                    <p className="brokers-lock"><ShieldCheck size={14} /> Lock active on broker — {c.lastLockAction?.detail}</p>
                  )}
                  {c.lastLockAction && c.lastLockAction.ok === false && (
                    <p className="brokers-error">Last lock action failed: {c.lastLockAction.detail}</p>
                  )}

                  <div className="brokers-actions">
                    <button className="btn btn-ghost" onClick={() => sync(c)} disabled={!state.configured}><RefreshCw size={14} /> Sync now</button>
                    <button className="btn btn-ghost settings-danger-btn" onClick={() => remove(c)}><Trash2 size={14} /> Disconnect</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <AnimatePresence initial={false}>
            {adding ? (
              <AddBroker key="form" onCancel={() => setAdding(false)} onAdded={(conn) => {
                setAdding(false);
                setState((s) => ({ ...s, connections: [...s.connections, conn] }));
                toast.success(`${conn.label} connected. Syncing your history…`);
                sync(conn);
              }} />
            ) : (
              <button key="add" className="btn btn-ghost brokers-add" onClick={() => setAdding(true)} disabled={!state.configured}>
                <Plus size={15} /> Connect a broker
              </button>
            )}
          </AnimatePresence>
        </>
      )}

      <CsvImport />
    </div>
  );
}

function AddBroker({ onCancel, onAdded }) {
  const toast = useToast();
  const [broker, setBroker] = useState('oanda');
  const [environment, setEnvironment] = useState('practice');
  const [creds, setCreds] = useState({});
  const [busy, setBusy] = useState(false);
  const def = BROKERS[broker];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/api/brokers', { broker, environment, credentials: creds });
      onAdded(data);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not connect'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.form
      className="brokers-form"
      onSubmit={submit}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <div className="brokers-form-head">
        <strong>Connect a broker</strong>
        <button type="button" className="btn btn-ghost" onClick={onCancel} aria-label="Cancel"><X size={15} /></button>
      </div>

      <div className="seg" role="tablist" aria-label="Broker">
        {Object.entries(BROKERS).map(([id, b]) => (
          <button type="button" key={id} role="tab" aria-selected={broker === id} className={`seg-btn ${broker === id ? 'is-on' : ''}`}
            onClick={() => { setBroker(id); setCreds({}); }}>
            {b.name}
          </button>
        ))}
      </div>
      <p className="settings-hint">{def.blurb} Use a <strong>read-only</strong> key where your broker offers one — we only need trade history{broker === 'alpaca' ? ' (plus trading permission if you want the lock to suspend the account)' : ''}.</p>

      <div className="seg" role="radiogroup" aria-label="Environment">
        {['practice', 'live'].map((env) => (
          <button type="button" key={env} role="radio" aria-checked={environment === env} className={`seg-btn ${environment === env ? 'is-on' : ''}`}
            onClick={() => setEnvironment(env)}>
            {def.envLabels[env]}
          </button>
        ))}
      </div>
      {environment === 'live' && (
        <div className="brokers-banner"><ShieldAlert size={16} /> Live account. Keys are encrypted at rest and never shown again.</div>
      )}

      <div className="settings-grid">
        {def.fields.map((f) => (
          <label className="field" key={f.key}>
            <span className="field-label">{f.label}</span>
            <input
              className="input mono"
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={f.placeholder}
              value={creds[f.key] || ''}
              onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="settings-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}><Plug size={15} /> {busy ? 'Verifying…' : 'Verify & connect'}</button>
      </div>
    </motion.form>
  );
}

// Most prop firms (FTMO included) run accounts on MetaTrader, whose own
// "Save as report" export is HTML. Their servers are usually on GMT+2/+3.
const MT_STEPS = [
  'MT5: Toolbox → History → right-click → Positions → Report → HTML (Open XML is not supported).',
  'MT4: Account History → right-click → All History → Save as Detailed Report.',
];
const PLATFORMS = [
  { id: 'ftmo', label: 'FTMO (MT4 / MT5)', offset: 2, steps: MT_STEPS },
  { id: 'mt-prop', label: 'Other MetaTrader prop firm', offset: 2, steps: MT_STEPS, note: 'e.g. FundedNext, The5ers, E8 — any account you trade in MT4 or MT5.' },
  { id: 'mt', label: 'MetaTrader 4 / 5 broker', offset: 2, steps: MT_STEPS, note: "Check your broker's server time in MT's Market Watch." },
  { id: 'csv', label: 'Other platform (CSV)', offset: 0, steps: ['Export closed trades as CSV with at least Symbol, Close time and Profit columns (cTrader, DXtrade, Match-Trader and most journals can).'] },
];

// MT5 saves reports as UTF-16; everything else is UTF-8.
async function readStatement(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  return new TextDecoder('utf-8').decode(buf);
}

function CsvImport() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [platform, setPlatform] = useState('ftmo');
  const [offset, setOffset] = useState(2);
  const [busy, setBusy] = useState(false);
  const def = PLATFORMS.find((p) => p.id === platform);

  const choose = (e) => {
    const next = PLATFORMS.find((p) => p.id === e.target.value);
    setPlatform(next.id);
    setOffset(next.offset);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('That file is over 5 MB');
    setBusy(true);
    try {
      const csv = await readStatement(file);
      const { data } = await api.post('/api/brokers/import/csv', {
        csv,
        utcOffsetMinutes: Number(offset) * 60,
        format: platform === 'csv' ? 'csv' : 'mt-csv',
      });
      toast.success(`Imported ${data.added} trade${data.added === 1 ? '' : 's'}${data.duplicates ? ` · ${data.duplicates} already in your journal` : ''}${data.skipped ? ` · ${data.skipped} non-trade rows skipped` : ''}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Import failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="brokers-csv">
      <div>
        <span className="toggle-title">Prop firm & MetaTrader statements</span>
        <span className="toggle-desc">Upload your account history and the trades land in your journal for review. Re-uploading is safe, because duplicates are skipped.</span>
      </div>
      <div className="brokers-csv-row">
        <label className="field brokers-platform">
          <span className="field-label">Account type</span>
          <select className="input" value={platform} onChange={choose}>
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="field brokers-offset">
          <span className="field-label">Server time (UTC±h)</span>
          <input className="input mono" type="number" min="-12" max="14" step="0.5" value={offset} onChange={(e) => setOffset(e.target.value)} />
        </label>
        <input ref={fileRef} type="file" accept=".htm,.html,.csv,.txt,text/html,text/csv" hidden onChange={onFile} data-testid="csv-input" />
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload size={15} /> {busy ? 'Importing…' : 'Upload statement'}
        </button>
      </div>
      <div className="brokers-steps">
        {def.note && <p>{def.note}</p>}
        <ol>{def.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {def.offset === 2 && <p>Most MT prop-firm servers run on GMT+2 in winter and GMT+3 in summer. Use 3 for summer trades.</p>}
      </div>
    </div>
  );
}
