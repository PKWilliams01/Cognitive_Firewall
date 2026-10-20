import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, Search, CircleCheck, CircleX, Timer, HeartPulse, Trash2, BookOpen, X,
} from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useToast } from './Toast';
import { INSTRUMENT_GROUPS, normaliseItem } from '../utils/instruments';
import './ReflectiveJournal.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'wins', label: 'Wins' },
  { id: 'losses', label: 'Losses' },
  { id: 'broken', label: 'Plan broken' },
];

const MOODS = ['Calm', 'Confident', 'Neutral', 'Anxious', 'Greedy', 'Angry'];
const HOT_MOODS = ['Anxious', 'Greedy', 'Angry'];

const CHECKIN_STATES = [
  { value: 'CALM', label: 'Calm', emoji: '🧘' },
  { value: 'FOCUSED', label: 'Focused', emoji: '🎯' },
  { value: 'CONFIDENT', label: 'Confident', emoji: '💪' },
  { value: 'ANXIOUS', label: 'Anxious', emoji: '😰' },
  { value: 'FRUSTRATED', label: 'Frustrated', emoji: '😤' },
  { value: 'IMPULSIVE', label: 'Impulsive', emoji: '⚡' },
];
const SESSIONS = ['PRE-MARKET', 'IN-TRADE', 'POST-MARKET', 'BREAK'];

const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isLong = (d) => d === 'buy' || d === 'Long';

const dayLabel = (date) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};

const holdTime = (t) => {
  const mins = Math.round((new Date(t.exitTime) - new Date(t.entryTime)) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

// <input type="datetime-local"> wants local time without a zone
const toLocalInput = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function ReflectiveJournal({ trades = [], userId, onTradeLogged, initialTab = 'trades' }) {
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="jr">
      <div className="jr-tabs" role="tablist" aria-label="Journal sections">
        {[
          { id: 'trades', label: 'Trades', icon: BookOpen },
          { id: 'checkins', label: 'Mood check-ins', icon: HeartPulse },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`jr-tab ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {tab === t.id && <motion.span layoutId="jr-tab-pill" className="jr-tab-pill" />}
            <span className="jr-tab-label"><t.icon size={15} /> {t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'trades'
        ? <TradesTab trades={trades} onTradeLogged={onTradeLogged} />
        : <CheckinsTab userId={userId} />}
    </div>
  );
}

/* ------------------------------ Trades ------------------------------ */

function TradesTab({ trades, onTradeLogged }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  const stats = useMemo(() => {
    const total = trades.length;
    const followed = trades.filter((t) => t.followedPlan).length;
    const wins = trades.filter((t) => toNumber(t.pnl) > 0).length;
    const net = trades.reduce((a, t) => a + toNumber(t.pnl), 0);
    return {
      total,
      adherence: total ? Math.round((followed / total) * 100) : 0,
      winRate: total ? Math.round((wins / total) * 100) : 0,
      net,
    };
  }, [trades]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trades.filter((t) => {
      if (q && !String(t.instrument || '').toLowerCase().includes(q) && !String(t.notes || '').toLowerCase().includes(q)) return false;
      if (filter === 'wins') return toNumber(t.pnl) > 0;
      if (filter === 'losses') return toNumber(t.pnl) < 0;
      if (filter === 'broken') return !t.followedPlan;
      return true;
    });
  }, [trades, filter, query]);

  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach((t) => {
      const key = dayLabel(t.entryTime || t.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return [...map.entries()];
  }, [visible]);

  return (
    <>
      <div className="jr-stats">
        <Stat label="Trades logged" value={stats.total} />
        <Stat label="Followed plan" value={`${stats.adherence}%`} tone={stats.adherence >= 70 ? 'up' : stats.total ? 'down' : ''} />
        <Stat label="Win rate" value={`${stats.winRate}%`} />
        <Stat label="Net P/L" value={money(stats.net)} tone={stats.net > 0 ? 'up' : stats.net < 0 ? 'down' : ''} />
      </div>

      <div className="jr-toolbar">
        <div className="jr-search">
          <Search size={15} />
          <input className="input" placeholder="Search instrument or notes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search trades" />
        </div>
        <div className="jr-filters" role="group" aria-label="Filter trades">
          {FILTERS.map((f) => (
            <button key={f.id} className={`chip ${filter === f.id ? 'is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Cancel' : 'Log past trade'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <ManualTradeForm onLogged={() => { setShowForm(false); onTradeLogged?.(); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {trades.length === 0 ? (
        <div className="card empty jr-empty">
          <BookOpen size={26} />
          <strong>No trades yet</strong>
          <span>Run a pre-flight from Execute trade, or log a past trade here.</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="card empty">No trades match this filter.</div>
      ) : (
        groups.map(([day, list]) => (
          <section key={day} className="jr-day" aria-label={day}>
            <h3 className="jr-day-title">{day}</h3>
            <div className="jr-list">
              {list.map((t, i) => <TradeCard key={t._id || i} t={t} i={i} />)}
            </div>
          </section>
        ))
      )}
    </>
  );
}

function TradeCard({ t, i }) {
  const pnl = toNumber(t.pnl);
  const hold = holdTime(t);
  return (
    <motion.article
      className={`card jr-trade ${pnl >= 0 ? 'is-win' : 'is-loss'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.03 }}
    >
      <div className="jr-trade-main">
        <span className={`badge ${isLong(t.direction) ? 'badge-up' : 'badge-down'}`}>{isLong(t.direction) ? 'Long' : 'Short'}</span>
        <span className="jr-trade-inst">{t.instrument || 'Asset'}</span>
        <span className="jr-trade-time mono">
          {new Date(t.entryTime || t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {hold && <><Timer size={12} /> {hold}</>}
        </span>
        <span className={`mono jr-trade-pnl ${pnl >= 0 ? 'text-up' : 'text-down'}`}>{money(pnl)}</span>
      </div>
      <div className="jr-trade-tags">
        {t.followedPlan
          ? <span className="badge badge-up"><CircleCheck size={11} /> Plan followed</span>
          : <span className="badge badge-down"><CircleX size={11} /> Plan broken</span>}
        {t.mood && <span className={`badge ${HOT_MOODS.includes(t.mood) ? 'badge-warn' : 'badge-neutral'}`}>{t.mood}</span>}
        {t.riskPercentage ? <span className="badge badge-neutral">{t.riskPercentage}% risk</span> : null}
        {t.source && t.source !== 'manual' && <span className="badge badge-accent">{t.source.toUpperCase()}</span>}
      </div>
      {t.notes && <p className="jr-trade-notes">{t.notes}</p>}
    </motion.article>
  );
}

function ManualTradeForm({ onLogged }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    instrument: '',
    direction: 'buy',
    entryTime: toLocalInput(Date.now() - 30 * 60000),
    exitTime: toLocalInput(Date.now()),
    pnl: '',
    riskPercentage: '1',
    mood: 'Neutral',
    followedPlan: false,
    notes: '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const timeError = form.entryTime && form.exitTime && new Date(form.exitTime) < new Date(form.entryTime) ? 'Exit must be after entry' : '';

  const submit = async (e) => {
    e.preventDefault();
    if (!form.instrument) return toast.error('Choose an instrument.');
    if (form.pnl === '' || !Number.isFinite(Number(form.pnl))) return toast.error('Enter the P/L.');
    if (timeError) return toast.error(timeError);
    setBusy(true);
    try {
      const pnl = Number(form.pnl);
      await api.post('/api/trades', {
        instrument: form.instrument,
        direction: form.direction,
        entryTime: new Date(form.entryTime),
        exitTime: new Date(form.exitTime),
        pnl,
        result: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
        riskPercentage: Number(form.riskPercentage),
        mood: form.mood,
        followedPlan: form.followedPlan,
        notes: form.notes,
      });
      toast.success('Trade logged to your journal.');
      onLogged?.();
    } catch (err) {
      const message = errorMessage(err, 'Could not log the trade.');
      if (err?.response?.status === 423) toast.lock(message);
      else toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card jr-form" onSubmit={submit} aria-label="Log a past trade">
      <div className="jr-form-grid">
        <label className="field">
          <span className="field-label">Instrument</span>
          <select className="input" value={form.instrument} onChange={set('instrument')}>
            <option value="">Select…</option>
            {INSTRUMENT_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map(normaliseItem).map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Direction</span>
          <select className="input" value={form.direction} onChange={set('direction')}>
            <option value="buy">Long</option>
            <option value="sell">Short</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">P/L ($)</span>
          <input className="input" type="number" step="0.01" placeholder="-120 or 250" value={form.pnl} onChange={set('pnl')} />
        </label>
        <label className="field">
          <span className="field-label">Entry</span>
          <input className="input" type="datetime-local" value={form.entryTime} onChange={set('entryTime')} />
        </label>
        <label className="field">
          <span className="field-label">Exit</span>
          <input className={`input ${timeError ? 'is-invalid' : ''}`} type="datetime-local" value={form.exitTime} onChange={set('exitTime')} />
          {timeError && <span className="field-hint is-error">{timeError}</span>}
        </label>
        <label className="field">
          <span className="field-label">Risk (%)</span>
          <input className="input" type="number" step="0.1" min="0.01" value={form.riskPercentage} onChange={set('riskPercentage')} />
        </label>
        <label className="field">
          <span className="field-label">Emotion</span>
          <select className="input" value={form.mood} onChange={set('mood')}>
            {MOODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="field jr-form-wide">
          <span className="field-label">Reflection</span>
          <textarea className="input" rows={2} maxLength={500} value={form.notes} onChange={set('notes')} placeholder="What was the setup? What were you feeling?" />
        </label>
      </div>
      <label className="toggle-row">
        <span>
          <span className="toggle-title">I followed my plan</span>
          <span className="toggle-desc">Only switch this on if entry, stop and exit all followed your rules.</span>
        </span>
        <span className={`toggle ${form.followedPlan ? 'is-on' : ''}`}>
          <input type="checkbox" role="switch" checked={form.followedPlan} onChange={set('followedPlan')} aria-label="I followed my plan" />
          <span className="toggle-knob" />
        </span>
      </label>
      <div className="jr-form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save to ledger'}</button>
      </div>
    </form>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="card jr-stat">
      <span className="jr-stat-label">{label}</span>
      <span className={`mono jr-stat-value ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : ''}`}>{value}</span>
    </div>
  );
}

/* ---------------------------- Check-ins ----------------------------- */

function CheckinsTab({ userId }) {
  const toast = useToast();
  const [entries, setEntries] = useState(null);
  const [state, setState] = useState('');
  const [confidence, setConfidence] = useState(6);
  const [session, setSession] = useState('PRE-MARKET');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/journal/user/${userId}`)
      .then((res) => setEntries(res?.data || []))
      .catch(() => setEntries([]));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!state) return toast.error('Pick how you’re feeling.');
    setBusy(true);
    try {
      await api.post('/api/journal', { emotionalState: state, confidenceLevel: confidence, sessionType: session, notes });
      toast.success('Check-in saved.');
      setState(''); setNotes(''); setConfidence(6);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save check-in.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/api/journal/${id}`);
      setEntries((list) => list.filter((x) => x._id !== id));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete check-in.'));
    }
  };

  return (
    <div className="jr-checkins">
      <form className="card jr-checkin-form" onSubmit={submit} aria-label="New mood check-in">
        <h3>How are you feeling right now?</h3>
        <p className="jr-checkin-lead">Checking in before you trade catches tilt earlier than any P/L number.</p>
        <div className="jr-states" role="radiogroup" aria-label="Emotional state">
          {CHECKIN_STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={state === s.value}
              className={`mood-chip ${state === s.value ? 'is-on' : ''} ${['ANXIOUS', 'FRUSTRATED', 'IMPULSIVE'].includes(s.value) ? 'is-hot' : ''}`}
              onClick={() => setState(s.value)}
            >
              <span aria-hidden="true">{s.emoji}</span> {s.label}
            </button>
          ))}
        </div>
        <div className="jr-form-grid">
          <label className="field">
            <span className="field-label">Confidence <span className="mono">{confidence}/10</span></span>
            <input className="range" type="range" min="1" max="10" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} style={{ '--fill': `${((confidence - 1) / 9) * 100}%` }} aria-label="Confidence level" />
          </label>
          <label className="field">
            <span className="field-label">Session</span>
            <select className="input" value={session} onChange={(e) => setSession(e.target.value)}>
              {SESSIONS.map((s) => <option key={s} value={s}>{s.replace('-', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</option>)}
            </select>
          </label>
          <label className="field jr-form-wide">
            <span className="field-label">Notes</span>
            <textarea className="input" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What’s on your mind? Sleep, stress, a loss you’re still thinking about…" />
          </label>
        </div>
        <div className="jr-form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !state}>{busy ? 'Saving…' : 'Save check-in'}</button>
        </div>
      </form>

      <div className="jr-list">
        {entries === null ? (
          <div className="card empty" aria-busy="true">Loading check-ins…</div>
        ) : entries.length === 0 ? (
          <div className="card empty">No check-ins yet. Your first one is above.</div>
        ) : entries.map((e) => {
          const meta = CHECKIN_STATES.find((s) => s.value === e.emotionalState);
          return (
            <article key={e._id} className="card jr-checkin">
              <div className="jr-checkin-head">
                <span className="jr-checkin-state"><span aria-hidden="true">{meta?.emoji}</span> {meta?.label || e.emotionalState}</span>
                <span className="badge badge-neutral">Confidence {e.confidenceLevel}/10</span>
                <span className={`badge ${e.revengeRiskAtEntry >= 50 ? 'badge-down' : 'badge-neutral'}`}>Risk {e.revengeRiskAtEntry}%</span>
                <span className="jr-checkin-time">{new Date(e.timestamp).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <button className="shell-icon-btn" onClick={() => remove(e._id)} aria-label="Delete check-in"><Trash2 size={14} /></button>
              </div>
              {e.notes && <p className="jr-trade-notes">{e.notes}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default ReflectiveJournal;
