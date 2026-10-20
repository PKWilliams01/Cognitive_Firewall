import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, ShieldCheck, Lock, Activity, TrendingUp, TrendingDown, CircleCheck, Circle, Timer, Flag, Sparkles,
} from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useToast } from './Toast';
import { parseRules } from '../utils/rules';
import { INSTRUMENT_GROUPS, normaliseItem } from '../utils/instruments';
import './TradeExecutionWizard.css';

const STEPS = [
  { id: 'PRE_FLIGHT', label: 'Pre-flight' },
  { id: 'LIVE', label: 'Live' },
  { id: 'DEBRIEF', label: 'Debrief' },
];

const MOODS = [
  { value: 'Calm', label: 'Calm', emoji: '🧘' },
  { value: 'Confident', label: 'Confident', emoji: '💪' },
  { value: 'Neutral', label: 'Neutral', emoji: '😐' },
  { value: 'Anxious', label: 'Anxious', emoji: '😰' },
  { value: 'Greedy', label: 'Greedy', emoji: '🤑' },
  { value: 'Angry', label: 'Angry', emoji: '😤' },
];

const elapsed = (from, now) => {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const slide = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.18 } },
};

export default function TradeExecutionWizard({ user, firewall, onClose, onTradeSuccess, onLocked }) {
  const toast = useToast();
  const [phase, setPhase] = useState('PRE_FLIGHT');
  const [instrument, setInstrument] = useState('');
  const [direction, setDirection] = useState('buy');
  const [risk, setRisk] = useState('1.0');
  const [checked, setChecked] = useState({});
  const [entryTime, setEntryTime] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [pnl, setPnl] = useState('');
  const [mood, setMood] = useState('Neutral');
  // Default to unchecked: never pre-claim adherence on the user's behalf.
  const [followedPlan, setFollowedPlan] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const rules = useMemo(() => parseRules(user?.tradingPlanRules || []), [user?.tradingPlanRules]);
  const hardRules = rules.filter((r) => r.hard);
  const checkedCount = rules.filter((r) => checked[r.id]).length;
  const hardChecked = hardRules.filter((r) => checked[r.id]).length;

  const cap = Number(firewall?.maxRiskPercent ?? user?.maxRiskPercent ?? 5);
  const dailyLimit = Number(firewall?.dailyLimit ?? user?.plannedDailyLimit ?? 3);
  const tradesRemaining = firewall?.tradesRemaining ?? dailyLimit;
  const locked = Boolean(firewall?.isLocked);
  const strict = user?.strictConfluence ?? true;

  const numericRisk = Number(risk);
  const riskError = !risk ? 'Enter your risk' : !(numericRisk > 0) ? 'Must be above 0' : numericRisk > cap ? `Above your ${cap}% cap` : '';
  const missingHard = hardRules.length - hardChecked;
  const missingStrict = strict && rules.length > 0 && checkedCount < rules.length;
  const blockReason = locked
    ? 'Execution locked'
    : !instrument
      ? 'Choose an instrument'
      : riskError
        ? riskError
        : missingHard > 0
          ? `Confirm ${missingHard} hard rule${missingHard === 1 ? '' : 's'}`
          : missingStrict
            ? `Confirm all ${rules.length} rules (strict mode)`
            : '';

  // Live position timer
  useEffect(() => {
    if (phase !== 'LIVE') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Esc closes from pre-flight; mid-trade it asks first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (phase === 'PRE_FLIGHT') onClose?.();
      else setConfirmLeave(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  const requestClearance = async () => {
    if (blockReason || busy) return;
    setBusy(true);
    try {
      const res = await api.post('/api/trades/preflight', {
        instrument,
        direction,
        riskPercentage: numericRisk,
        confluencesChecked: checkedCount,
        confluencesTotal: rules.length,
        hardChecked,
        hardTotal: hardRules.length,
      });
      if (rules.length > 0 && checkedCount < rules.length) {
        toast.info(`Cleared with ${checkedCount}/${rules.length} confluences. Skipped rules reduce your edge.`);
      }
      (res?.data?.warnings || []).filter((w) => w.severity === 'high').forEach((w) => toast.info(w.message));
      setEntryTime(new Date());
      setNow(Date.now());
      setPhase('LIVE');
    } catch (err) {
      const message = errorMessage(err, 'Pre-flight failed.');
      if (err?.response?.status === 423) {
        toast.lock(message);
        onLocked?.();
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const logTrade = async () => {
    const value = Number(pnl);
    if (pnl === '' || !Number.isFinite(value)) return toast.error('Enter the final P/L for this trade.');
    setBusy(true);
    try {
      await api.post('/api/trades', {
        instrument,
        direction,
        entryTime,
        exitTime: new Date(),
        pnl: value,
        result: value > 0 ? 'win' : value < 0 ? 'loss' : 'breakeven',
        followedPlan,
        mood,
        notes,
        riskPercentage: numericRisk,
      });
      toast.success('Trade logged. Your metrics are updating.');
      onTradeSuccess?.();
      onClose?.();
    } catch (err) {
      const message = errorMessage(err, 'Could not save the trade.');
      if (err?.response?.status === 423) {
        toast.lock(message);
        onLocked?.();
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === phase);
  const closeRequest = () => (phase === 'PRE_FLIGHT' ? onClose?.() : setConfirmLeave(true));

  return (
    <motion.div
      className="wiz"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiz-title"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="wiz-head">
        <ol className="wiz-steps" aria-label="Trade steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className={`wiz-step ${i === stepIndex ? 'is-current' : ''} ${i < stepIndex ? 'is-done' : ''}`} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="wiz-step-dot">{i < stepIndex ? <CircleCheck size={14} /> : i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
        <button className="shell-icon-btn" onClick={closeRequest} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <AnimatePresence>
        {confirmLeave && (
          <motion.div className="wiz-leave" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <span>Leave without logging this trade? It won’t count toward your metrics.</span>
            <div>
              <button className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>Stay</button>
              <button className="btn btn-danger" onClick={() => onClose?.()}>Leave</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="wiz-body">
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'PRE_FLIGHT' && (
            <motion.section key="pre" {...slide}>
              <h2 id="wiz-title">Pre-flight check</h2>
              <p className="wiz-lead">Confirm the setup before you enter. The firewall clears or blocks this trade on the server.</p>

              <div className="wiz-status">
                <StatusPill icon={Flag} label="Trades left today" value={`${tradesRemaining}/${dailyLimit}`} tone={tradesRemaining <= 1 ? 'warn' : 'ok'} />
                <StatusPill icon={Activity} label="Revenge risk" value={`${firewall?.revengeRisk ?? 0}%`} tone={(firewall?.revengeRisk ?? 0) >= 50 ? 'warn' : 'ok'} />
                <StatusPill icon={ShieldCheck} label="Risk cap" value={`${cap}%`} tone="ok" />
              </div>

              {locked ? (
                <div className="wiz-locked" role="alert">
                  <Lock size={20} />
                  <div>
                    <strong>{firewall?.lockReason === 'daily_limit' ? 'Daily limit reached' : 'Hard Lock engaged'}</strong>
                    <p>{firewall?.lockReason === 'daily_limit' ? 'You’ve used every trade your plan allows today.' : 'Revenge risk is critical. The server will refuse new trades until you’ve cooled off.'}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="wiz-grid">
                    <label className="field">
                      <span className="field-label">Instrument</span>
                      <select className="input" value={instrument} onChange={(e) => setInstrument(e.target.value)} aria-label="Instrument">
                        <option value="">Select…</option>
                        {INSTRUMENT_GROUPS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.items.map(normaliseItem).map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </label>

                    <div className="field">
                      <span className="field-label">Direction</span>
                      <div className="seg" role="radiogroup" aria-label="Direction">
                        <button type="button" role="radio" aria-checked={direction === 'buy'} className={`seg-btn is-long ${direction === 'buy' ? 'is-on' : ''}`} onClick={() => setDirection('buy')}>
                          <TrendingUp size={15} /> Long
                        </button>
                        <button type="button" role="radio" aria-checked={direction === 'sell'} className={`seg-btn is-short ${direction === 'sell' ? 'is-on' : ''}`} onClick={() => setDirection('sell')}>
                          <TrendingDown size={15} /> Short
                        </button>
                      </div>
                    </div>

                    <label className="field">
                      <span className="field-label">Risk (% of account)</span>
                      <div className="wiz-suffix">
                        <input className={`input ${riskError && risk !== '' ? 'is-invalid' : ''}`} type="number" min="0.01" step="0.1" value={risk} onChange={(e) => setRisk(e.target.value)} aria-label="Risk percent" />
                        <span>%</span>
                      </div>
                      <span className={`field-hint ${riskError && risk !== '' ? 'is-error' : ''}`}>{riskError && risk !== '' ? riskError : `Cap ${cap}% per trade`}</span>
                    </label>
                  </div>

                  <div className="wiz-rules">
                    <div className="wiz-rules-head">
                      <span className="field-label">Confluences</span>
                      {rules.length > 0 && <span className="mono wiz-rules-count">{checkedCount}/{rules.length} confirmed</span>}
                    </div>
                    {rules.length > 0 && (
                      <div className="meter wiz-rules-meter" style={{ color: checkedCount === rules.length ? 'var(--primary)' : 'var(--warning)' }}>
                        <span style={{ width: `${(checkedCount / rules.length) * 100}%` }} />
                      </div>
                    )}
                    {rules.length === 0 ? (
                      <p className="wiz-empty-rules"><Sparkles size={14} /> No rules yet. Add your checklist in Strategy and it appears here.</p>
                    ) : (
                      <ul>
                        {rules.map((r) => (
                          <li key={r.id}>
                            <label className={`wiz-rule ${checked[r.id] ? 'is-checked' : ''}`}>
                              <input type="checkbox" checked={Boolean(checked[r.id])} onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))} />
                              {checked[r.id] ? <CircleCheck size={18} className="wiz-rule-icon" /> : <Circle size={18} className="wiz-rule-icon" />}
                              <span className="wiz-rule-label">{r.label}</span>
                              {r.hard && <span className="badge badge-down">Hard</span>}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              <div className="wiz-actions">
                {blockReason && !locked && <span className="wiz-block-reason">{blockReason}</span>}
                <button className="btn btn-primary wiz-primary" onClick={requestClearance} disabled={Boolean(blockReason) || busy}>
                  <ShieldCheck size={16} /> {busy ? 'Checking…' : 'Request clearance'}
                </button>
              </div>
            </motion.section>
          )}

          {phase === 'LIVE' && (
            <motion.section key="live" {...slide}>
              <h2 id="wiz-title">Position open</h2>
              <div className={`wiz-live ${direction === 'buy' ? 'is-long' : 'is-short'}`}>
                <span className="wiz-live-badge"><span className="live-dot" /> LIVE</span>
                <div className="wiz-live-inst">{instrument}</div>
                <div className="wiz-live-meta">
                  <span className={`badge ${direction === 'buy' ? 'badge-up' : 'badge-down'}`}>{direction === 'buy' ? 'Long' : 'Short'}</span>
                  <span className="mono">{numericRisk}% risk</span>
                </div>
                <div className="wiz-live-timer mono" aria-label="Time in trade"><Timer size={16} /> {elapsed(entryTime || now, now)}</div>
              </div>
              <p className="wiz-lead">Stick to your stop and target. Close it here when the trade is done to run the debrief.</p>
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmLeave(true)}>I didn’t take it</button>
                <button className="btn btn-primary wiz-primary" onClick={() => setPhase('DEBRIEF')}>
                  <Flag size={16} /> Close position
                </button>
              </div>
            </motion.section>
          )}

          {phase === 'DEBRIEF' && (
            <motion.section key="debrief" {...slide}>
              <h2 id="wiz-title">Post-trade debrief</h2>
              <p className="wiz-lead">Be honest — the firewall is only as good as what you tell it.</p>

              <label className="field">
                <span className="field-label">Result (P/L)</span>
                <div className="wiz-suffix wiz-pnl">
                  <span>$</span>
                  <input
                    className={`input ${Number(pnl) > 0 ? 'is-win' : Number(pnl) < 0 ? 'is-loss' : ''}`}
                    type="number"
                    step="0.01"
                    placeholder="-120 or 250"
                    value={pnl}
                    onChange={(e) => setPnl(e.target.value)}
                    aria-label="Profit or loss"
                    autoFocus
                  />
                </div>
              </label>

              <div className="field">
                <span className="field-label">How did you feel?</span>
                <div className="mood-chips" role="radiogroup" aria-label="Primary emotion">
                  {MOODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={mood === m.value}
                      className={`mood-chip ${mood === m.value ? 'is-on' : ''} ${['Anxious', 'Greedy', 'Angry'].includes(m.value) ? 'is-hot' : ''}`}
                      onClick={() => setMood(m.value)}
                    >
                      <span aria-hidden="true">{m.emoji}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="toggle-row">
                <span>
                  <span className="toggle-title">I followed my plan</span>
                  <span className="toggle-desc">Entry, stop and exit all went as planned.</span>
                </span>
                <span className={`toggle ${followedPlan ? 'is-on' : ''}`}>
                  <input type="checkbox" role="switch" checked={followedPlan} onChange={(e) => setFollowedPlan(e.target.checked)} aria-label="I followed my plan" />
                  <span className="toggle-knob" />
                </span>
              </label>

              <label className="field">
                <span className="field-label">Reflection</span>
                <textarea className="input" rows={3} maxLength={500} placeholder="Why did you exit? Did you panic, or hit your target?" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <div className="wiz-actions">
                <button className="btn btn-primary wiz-primary" onClick={logTrade} disabled={busy}>
                  <CircleCheck size={16} /> {busy ? 'Logging…' : 'Log trade'}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function StatusPill({ icon: Icon, label, value, tone }) {
  return (
    <div className={`wiz-pill is-${tone}`}>
      <Icon size={14} />
      <span className="wiz-pill-label">{label}</span>
      <span className="mono wiz-pill-value">{value}</span>
    </div>
  );
}
