import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock, Hourglass, Wind, MonitorOff, Coffee, PenLine, Quote, Flag } from 'lucide-react';
import './CooldownScreen.css';

// Box breathing: four equal phases. Slows the stress response before a decision.
const BREATH = [
  { label: 'Breathe in', scale: 1 },
  { label: 'Hold', scale: 1 },
  { label: 'Breathe out', scale: 0.55 },
  { label: 'Hold', scale: 0.55 },
];
const PHASE_MS = 4000;

const nextMidnight = (now) => {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d;
};

export const formatRemaining = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

export default function CooldownScreen({ firewall, user, onClose, onCheckIn, onUnlock }) {
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(Date.now());
  const [breath, setBreath] = useState(0);

  const dailyLimit = firewall?.lockReason === 'daily_limit';
  const target = firewall?.lockedUntil ? new Date(firewall.lockedUntil) : nextMidnight(now);
  const remaining = target.getTime() - now;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const id = setInterval(() => setBreath((b) => (b + 1) % BREATH.length), PHASE_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // A timed cool-off has ended: let the app re-check with the server.
  useEffect(() => {
    if (firewall?.lockedUntil && remaining <= 0) onUnlock?.();
  }, [firewall?.lockedUntil, remaining, onUnlock]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const phase = BREATH[breath];

  return (
    <motion.div
      className={`cool ${dailyLimit ? 'is-complete' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cool-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="cool-inner">
        <motion.div className="cool-badge" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
          {dailyLimit ? <Flag size={14} /> : <Lock size={14} />}
          {dailyLimit ? 'SESSION COMPLETE' : 'HARD LOCK ENGAGED'}
        </motion.div>

        <h1 id="cool-title">{dailyLimit ? 'That’s your plan done for today.' : 'Step away. This is the trade not to take.'}</h1>
        <p className="cool-lead">
          {dailyLimit
            ? `You’ve taken all ${firewall?.dailyLimit ?? ''} trades your plan allows. Stopping here is the discipline — not a punishment.`
            : `Revenge risk hit ${firewall?.revengeRisk ?? ''}%. Your last trades look reactive, so the firewall has locked execution.`}
        </p>

        <div className="cool-timer" aria-live="polite">
          <Hourglass size={16} />
          <span>{firewall?.lockedUntil ? 'Unlocks in' : 'Resets at midnight —'}</span>
          <span className="mono cool-timer-value">{formatRemaining(remaining)}</span>
        </div>

        <div className="cool-breath">
          <motion.div
            className="cool-breath-circle"
            animate={{ scale: reduceMotion ? 0.8 : phase.scale }}
            transition={{ duration: PHASE_MS / 1000, ease: 'easeInOut' }}
          >
            <Wind size={22} />
          </motion.div>
          <div className="cool-breath-label" aria-live="polite">
            {reduceMotion ? 'Breathe in 4 · hold 4 · out 4 · hold 4' : phase.label}
          </div>
          <div className="cool-breath-hint">Box breathing · four seconds each</div>
        </div>

        {user?.whyITrade ? (
          <blockquote className="cool-quote">
            <Quote size={18} />
            <p>{user.whyITrade}</p>
            <cite>— you, when you were calm</cite>
          </blockquote>
        ) : (
          <p className="cool-noquote">Tip: write a “why I trade” note in Settings. You’ll see it here next time.</p>
        )}

        <ul className="cool-steps">
          <li><MonitorOff size={16} /> Close your trading platform</li>
          <li><Coffee size={16} /> Get away from the screen for 15 minutes</li>
          <li><PenLine size={16} /> Write down what happened while it’s fresh</li>
        </ul>

        <div className="cool-actions">
          <button className="btn btn-outline" onClick={onCheckIn}><PenLine size={15} /> Log how I feel</button>
          <button className="btn btn-primary" onClick={onClose}>Back to dashboard</button>
        </div>
      </div>
    </motion.div>
  );
}
