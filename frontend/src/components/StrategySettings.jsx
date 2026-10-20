import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2, Lock, LockOpen, ShieldAlert, ListChecks, Minus, Sparkles } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useToast } from './Toast';
import { parseRules, serializeRule } from '../utils/rules';
import './StrategySettings.css';

const TEMPLATES = [
  { label: 'Stop loss set before entry', hard: true },
  { label: 'Risk at or below my per-trade cap', hard: true },
  { label: 'No new trade within 15 minutes of a loss', hard: true },
  { label: 'Clear higher-timeframe bias', hard: false },
  { label: 'Inside my planned session (London / New York)', hard: false },
  { label: 'Minimum 2R reward-to-risk', hard: false },
];

export default function StrategySettings({ user, onUpdate, firewallLocked = false }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [rules, setRules] = useState(() => parseRules(user?.tradingPlanRules || []));
  const [dailyLimit, setDailyLimit] = useState(user?.plannedDailyLimit || 3);
  const [draft, setDraft] = useState('');
  const [draftHard, setDraftHard] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-sync when the saved plan changes elsewhere (e.g. Settings).
  useEffect(() => {
    if (editing) return;
    setRules(parseRules(user?.tradingPlanRules || []));
    setDailyLimit(user?.plannedDailyLimit || 3);
  }, [user?.tradingPlanRules, user?.plannedDailyLimit, editing]);

  const hard = useMemo(() => rules.filter((r) => r.hard), [rules]);
  const soft = useMemo(() => rules.filter((r) => !r.hard), [rules]);
  const existing = useMemo(() => new Set(rules.map((r) => r.label.toLowerCase())), [rules]);

  const addRule = (label, isHard) => {
    const clean = label.trim();
    if (!clean) return;
    if (existing.has(clean.toLowerCase())) return toast.info('That rule is already in your plan.');
    if (rules.length >= 30) return toast.error('Plans are limited to 30 rules.');
    const raw = serializeRule(clean, isHard);
    setRules((list) => [...list, { id: `new-${Date.now()}-${clean}`, raw, hard: isHard, label: clean }]);
  };

  const submitDraft = (e) => {
    e.preventDefault();
    addRule(draft, draftHard);
    setDraft('');
  };

  const cancel = () => {
    setRules(parseRules(user?.tradingPlanRules || []));
    setDailyLimit(user?.plannedDailyLimit || 3);
    setEditing(false);
  };

  const seal = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/api/users/me', {
        tradingPlanRules: rules.map((r) => r.raw),
        plannedDailyLimit: Number(dailyLimit),
      });
      onUpdate?.(res.data);
      setEditing(false);
      toast.success('Plan sealed. The firewall is enforcing your new rules.');
    } catch (err) {
      const message = errorMessage(err, 'Could not save your strategy.');
      if (err?.response?.status === 423) toast.lock(message);
      else toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="strat">
      <section className={`card strat-banner ${editing ? 'is-editing' : ''}`}>
        <span className="strat-banner-icon">{editing ? <LockOpen size={20} /> : <Lock size={20} />}</span>
        <div className="strat-banner-text">
          <span className="card-title">Plan status</span>
          <h2>{editing ? 'Editing your plan' : 'Sealed & enforced'}</h2>
          <p>
            {editing
              ? 'Changes apply after you seal. Tightening is always allowed; loosening is blocked while the firewall is locked.'
              : 'Every pre-flight checks these rules. Hard rules can never be skipped.'}
          </p>
        </div>
        <div className="strat-banner-actions">
          {editing ? (
            <>
              <button className="btn btn-ghost" onClick={cancel} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={seal} disabled={saving}>
                <Lock size={15} /> {saving ? 'Sealing…' : 'Seal plan'}
              </button>
            </>
          ) : (
            <button className="btn btn-outline" onClick={() => setEditing(true)}>
              <LockOpen size={15} /> Edit plan
            </button>
          )}
        </div>
      </section>

      {firewallLocked && editing && (
        <div className="strat-locked" role="note">
          <ShieldAlert size={16} />
          <span>The firewall is locked. You can add rules or tighten your limit, but removing rules or raising the limit will be refused until it unlocks.</span>
        </div>
      )}

      <section className="card strat-limit">
        <div>
          <span className="card-title">Max trades per day</span>
          <p>Hitting this locks execution for the rest of the day and drives the Impulsivity Index.</p>
        </div>
        <div className="strat-stepper" role="group" aria-label="Max trades per day">
          <button className="shell-icon-btn" onClick={() => setDailyLimit((n) => Math.max(1, n - 1))} disabled={!editing || dailyLimit <= 1} aria-label="Decrease daily limit">
            <Minus size={16} />
          </button>
          <span className="mono strat-limit-value" aria-live="polite">{dailyLimit}</span>
          <button className="shell-icon-btn" onClick={() => setDailyLimit((n) => Math.min(50, n + 1))} disabled={!editing || dailyLimit >= 50} aria-label="Increase daily limit">
            <Plus size={16} />
          </button>
        </div>
      </section>

      <div className="strat-columns">
        <RuleColumn
          title="System-critical (hard)"
          desc="Must be confirmed on every trade."
          tone="hard"
          rules={hard}
          editing={editing}
          onRemove={(id) => setRules((list) => list.filter((r) => r.id !== id))}
        />
        <RuleColumn
          title="Operational (soft)"
          desc="Required in strict mode, otherwise advisory."
          tone="soft"
          rules={soft}
          editing={editing}
          onRemove={(id) => setRules((list) => list.filter((r) => r.id !== id))}
        />
      </div>

      <AnimatePresence>
        {editing && (
          <motion.section
            className="card strat-builder"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <span className="card-title"><ListChecks size={14} /> Add a rule</span>
            <form className="strat-add" onSubmit={submitDraft}>
              <input
                className="input"
                placeholder="e.g. Liquidity sweep of the daily high"
                maxLength={160}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="New rule"
              />
              <div className="seg strat-kind" role="radiogroup" aria-label="Enforcement level">
                <button type="button" role="radio" aria-checked={!draftHard} className={`seg-btn is-long ${!draftHard ? 'is-on' : ''}`} onClick={() => setDraftHard(false)}>Soft</button>
                <button type="button" role="radio" aria-checked={draftHard} className={`seg-btn is-short ${draftHard ? 'is-on' : ''}`} onClick={() => setDraftHard(true)}>Hard</button>
              </div>
              <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
                <Plus size={15} /> Add
              </button>
            </form>

            <div className="strat-templates">
              <span className="field-hint"><Sparkles size={12} /> Common rules</span>
              <div>
                {TEMPLATES.filter((t) => !existing.has(t.label.toLowerCase())).map((t) => (
                  <button key={t.label} type="button" className={`chip ${t.hard ? 'strat-chip-hard' : ''}`} onClick={() => addRule(t.label, t.hard)}>
                    <Plus size={12} /> {t.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function RuleColumn({ title, desc, tone, rules, editing, onRemove }) {
  return (
    <section className={`card strat-col strat-col-${tone}`} aria-label={title}>
      <header className="strat-col-head">
        <div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        <span className="badge badge-neutral">{rules.length}</span>
      </header>
      {rules.length === 0 ? (
        <div className="strat-col-empty">{editing ? 'Add one below.' : 'None yet.'}</div>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {rules.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="strat-rule"
              >
                <span className="strat-rule-dot" aria-hidden="true" />
                <span className="strat-rule-label">{r.label}</span>
                {editing && (
                  <button className="shell-icon-btn" onClick={() => onRemove(r.id)} aria-label={`Remove rule: ${r.label}`}>
                    <Trash2 size={14} />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
