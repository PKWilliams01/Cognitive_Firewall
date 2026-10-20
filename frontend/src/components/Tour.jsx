import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, X, ListChecks } from 'lucide-react';
import './Tour.css';

// Each step can switch page (view) and spotlight a real element (target).
// Steps whose target isn't on screen (e.g. sidebar on mobile) show centred.
export const TOUR_STEPS = [
  {
    title: 'Welcome to the terminal',
    body: "Cognitive Firewall sits between you and your worst trading impulses. This 2-minute tour shows you the setup and the daily loop. You can jump to any step from the list.",
  },
  {
    view: 'strategy',
    target: '.strat',
    title: '1. Write your trading plan',
    body: 'Start here. Add the rules every trade must meet: your confluences. Prefix a rule with [HARD] to make it impossible to skip. Set your daily trade limit too.',
  },
  {
    view: 'settings',
    target: '#settings-firewall',
    title: '2. Set your risk boundaries',
    body: 'Starting balance, max risk per trade, the revenge-risk level that triggers the Hard Lock, and how long a cool-off lasts. The server enforces these. They can only be loosened while the firewall is unlocked.',
  },
  {
    view: 'settings',
    target: '#settings-cooloff',
    title: '3. Leave a note for your future self',
    body: "Why do you trade? When you're locked out, this is what you'll see. Write it on a calm day.",
  },
  {
    view: 'settings',
    target: '#settings-brokers',
    title: '4. Connect your broker (optional)',
    body: 'Link OANDA, Alpaca or Binance to import trades automatically. For FTMO and other prop firms, upload your MetaTrader statement. You can also let the Hard Lock act on the broker account.',
  },
  {
    target: '.shell-execute',
    title: '5. Run a pre-flight before every trade',
    body: 'Press Execute trade (or E). Pick the instrument, confirm each rule, set your risk. The server approves or blocks the trade before you place it.',
  },
  {
    view: 'dashboard',
    target: '.dash-hero-meter',
    title: '6. Watch your revenge risk',
    body: 'This gauge rises with rapid trades after a loss and with broken rules. It falls when you trade calmly. Cross your threshold and execution locks. No overrides.',
  },
  {
    view: 'dashboard',
    target: '.dash-kpis',
    title: '7. Read your discipline numbers',
    body: 'Plan adherence, impulsivity versus your daily limit, and win rate. Your streak calendar below shows clean days in a row.',
  },
  {
    view: 'journal',
    target: '.jr',
    title: '8. Review and reflect',
    body: 'Every trade lands in the Journal. Imported trades wait for your review: did you follow the plan, and how did you feel? Log mood check-ins before and after sessions.',
  },
  {
    title: "You're set",
    body: "That's the loop: plan, pre-flight, trade, reflect. Re-open this tour any time from \"Take the tour\" in the sidebar. The Operator's manual explains every metric.",
  },
];

const PAD = 8;

export default function Tour({ onNavigate, onClose, onOpenManual, initialStep = 0 }) {
  const [step, setStep] = useState(initialStep);
  const [rect, setRect] = useState(null);
  const [showList, setShowList] = useState(false);
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  useEffect(() => { if (s.view) onNavigate(s.view); }, [s.view, onNavigate]);

  // Find the target after the page transition, scroll it into view, then measure.
  const measure = useCallback(() => {
    const el = s.target && document.querySelector(s.target);
    const r = el?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return setRect(null);
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [s.target]);

  useLayoutEffect(() => {
    setRect(null);
    if (!s.target) return undefined;
    const t = setTimeout(() => {
      const el = document.querySelector(s.target);
      if (el && el.getBoundingClientRect().width) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(measure, 350);
    }, 380);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [s.target, measure]);

  const go = useCallback((i) => { setShowList(false); setStep(Math.max(0, Math.min(TOUR_STEPS.length - 1, i))); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') last ? onClose() : go(step + 1);
      else if (e.key === 'ArrowLeft') go(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last, go, onClose]);

  // Card goes below the spotlight if there's room, otherwise above, otherwise centred.
  const cardStyle = (() => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const w = Math.min(380, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - w - 16));
    if (window.innerHeight - (rect.top + rect.height) > 260) return { top: rect.top + rect.height + 12, left, width: w };
    if (rect.top > 260) return { bottom: window.innerHeight - rect.top + 12, left, width: w };
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  })();

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Getting started tour">
      {rect ? (
        <motion.div className="tour-spot" initial={false} animate={rect} transition={{ type: 'spring', stiffness: 300, damping: 32 }} />
      ) : (
        <div className="tour-dim" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="tour-card card"
          style={cardStyle}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="tour-card-head">
            <span className="mono tour-count">STEP {step + 1} / {TOUR_STEPS.length}</span>
            <button className="tour-icon" onClick={() => setShowList((v) => !v)} aria-label="All steps" aria-expanded={showList}><ListChecks size={15} /></button>
            <button className="tour-icon" onClick={onClose} aria-label="Close tour"><X size={15} /></button>
          </div>

          {showList ? (
            <ol className="tour-list">
              {TOUR_STEPS.map((t, i) => (
                <li key={t.title}>
                  <button className={`tour-list-item ${i === step ? 'is-on' : ''}`} onClick={() => go(i)}>
                    <span className={`tour-list-dot ${i < step ? 'is-done' : ''}`}>{i < step ? <Check size={10} /> : i + 1}</span>
                    {t.title.replace(/^\d+\.\s*/, '')}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </>
          )}

          <div className="tour-dots" aria-hidden="true">
            {TOUR_STEPS.map((_, i) => (
              <button key={i} tabIndex={-1} className={`tour-dot ${i === step ? 'is-on' : i < step ? 'is-done' : ''}`} onClick={() => go(i)} />
            ))}
          </div>

          <div className="tour-actions">
            {step === 0 ? (
              <button className="btn btn-ghost" onClick={onClose}>Skip tour</button>
            ) : (
              <button className="btn btn-ghost" onClick={() => go(step - 1)}><ArrowLeft size={15} /> Back</button>
            )}
            {last ? (
              <div className="tour-actions-end">
                {onOpenManual && <button className="btn btn-ghost" onClick={() => { onClose(); onOpenManual(); }}>Open manual</button>}
                <button className="btn btn-primary" onClick={onClose}><Check size={15} /> Finish</button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={() => go(step + 1)}>{step === 0 ? 'Start' : 'Next'} <ArrowRight size={15} /></button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
