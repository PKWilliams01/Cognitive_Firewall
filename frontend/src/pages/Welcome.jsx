import React, { useEffect, useState } from 'react';
import {
  motion,
  animate,
  useMotionValue,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import { Brain, ShieldCheck, Activity, Lock, ArrowRight, ClipboardCheck, Radar } from 'lucide-react';
import './Welcome.css';

// Illustrative behavioural readouts for the ticker — no market prices, since
// the app analyses behaviour and never connects to a broker.
const TICKER = [
  { label: 'DISCIPLINE', value: '94%', tone: 'up' },
  { label: 'REVENGE RISK', value: '12%', tone: 'up' },
  { label: 'IMPULSIVITY', value: '0.33x', tone: 'up' },
  { label: 'TRADES TODAY', value: '1 / 3', tone: 'flat' },
  { label: 'PLAN ADHERENCE', value: '100%', tone: 'up' },
  { label: 'TILT PROBABILITY', value: 'LOW', tone: 'up' },
  { label: 'HARD LOCK', value: 'STANDBY', tone: 'flat' },
  { label: 'SYSTEM INTEGRITY', value: 'OPERATIONAL', tone: 'up' },
];

// The demo gauge walks through a tilt spiral and ends in a Hard Lock.
const GAUGE_SEQUENCE = [14, 37, 62, 88];

const STEPS = [
  {
    icon: ClipboardCheck,
    kicker: '01 · Pre-Flight',
    title: 'Check in before you trade',
    desc: 'A mandatory risk check confirms your mindset, plan and confluences before the first order. No check-in, no session.',
  },
  {
    icon: Radar,
    kicker: '02 · Live monitor',
    title: 'Every trade, scored in real time',
    desc: 'The engine tracks trade frequency, rule breaks and how fast you re-enter after a loss — the signatures of tilt.',
  },
  {
    icon: Lock,
    kicker: '03 · Hard Lock',
    title: 'It steps in when you can’t',
    desc: 'When revenge risk crosses the threshold, execution locks. You step away at the exact moment you’d least choose to.',
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function Welcome({ onContinue }) {
  return (
    <div className="wl">
      <div className="grid-bg" aria-hidden="true" />
      <div className="glow-orb wl-orb-a" aria-hidden="true" />
      <div className="glow-orb wl-orb-b" aria-hidden="true" />

      <header className="wl-nav">
        <div className="wl-brand">
          <span className="wl-logo"><Brain size={18} /></span>
          <span className="wl-brand-text">COGNITIVE<span>FIREWALL</span></span>
        </div>
        <button className="wl-nav-cta" onClick={() => onContinue('login')}>Sign in</button>
      </header>

      <Ticker />

      <main className="wl-hero">
        <div className="wl-copy">
          <motion.div className="wl-kicker" variants={fadeUp} initial="hidden" animate="show" custom={0}>
            <span className="live-dot" /> Behavioural risk engine for day traders
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}>
            Trade your plan.
            <br />
            <span className="wl-gradient">Not your emotions.</span>
          </motion.h1>

          <motion.p className="wl-lead" variants={fadeUp} initial="hidden" animate="show" custom={2}>
            Cognitive Firewall watches for tilt — revenge trades, broken rules, overtrading — and
            locks you out before a bad loss turns into a blown account.
          </motion.p>

          <motion.div className="wl-actions" variants={fadeUp} initial="hidden" animate="show" custom={3}>
            <button className="wl-btn wl-btn-primary" onClick={() => onContinue('register')}>
              Get started <ArrowRight size={18} />
            </button>
            <a className="wl-btn wl-btn-ghost" href="#how-it-works">See how it works</a>
          </motion.div>

          <motion.ul className="wl-proof" variants={fadeUp} initial="hidden" animate="show" custom={4}>
            <li><ShieldCheck size={15} /> Analytics only — never touches your broker</li>
            <li><Activity size={15} /> Scores every session in real time</li>
          </motion.ul>
        </div>

        <motion.div
          className="wl-visual"
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <RiskGauge />
        </motion.div>
      </main>

      <section id="how-it-works" className="wl-steps">
        <motion.h2
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
        >
          Three layers between you and a revenge trade
        </motion.h2>
        <div className="wl-step-grid">
          {STEPS.map((s, i) => (
            <motion.article
              key={s.kicker}
              className="wl-step"
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.4 }}
              custom={i}
              whileHover={{ y: -4 }}
            >
              <span className="wl-step-icon"><s.icon size={20} /></span>
              <span className="wl-step-kicker mono">{s.kicker}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </motion.article>
          ))}
        </div>

        <motion.div
          className="wl-final"
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
        >
          <p>Your edge is your discipline. Protect it.</p>
          <button className="wl-btn wl-btn-primary" onClick={() => onContinue('register')}>
            Create your profile <ArrowRight size={18} />
          </button>
        </motion.div>
      </section>

      <footer className="wl-footer">
        Cognitive Firewall is an analytics and coaching tool. It does not place trades or connect to broker accounts.
      </footer>
    </div>
  );
}

function Ticker() {
  const items = [...TICKER, ...TICKER]; // duplicated for a seamless loop
  return (
    <div className="wl-ticker" aria-label="Example behavioural readouts">
      <div className="wl-ticker-track">
        {items.map((t, i) => (
          <span key={i} className="wl-tick mono">
            <span className="wl-tick-label">{t.label}</span>
            <span className={`wl-tick-value tone-${t.tone}`}>{t.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RiskGauge() {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(reduceMotion ? GAUGE_SEQUENCE.length - 1 : 0);
  const target = GAUGE_SEQUENCE[step];

  const value = useMotionValue(0);
  const rounded = useTransform(value, (v) => Math.round(v));
  const dashOffset = useTransform(value, (v) => 100 - v);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const controls = animate(value, target, { duration: reduceMotion ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [target, value, reduceMotion]);

  useEffect(() => rounded.on('change', setShown), [rounded]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const id = setInterval(() => setStep((s) => (s + 1) % GAUGE_SEQUENCE.length), 2200);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const locked = target >= 80;
  const tone = locked ? 'danger' : target >= 50 ? 'warning' : 'primary';

  return (
    <div className={`gauge-card tone-${tone}`}>
      <div className="gauge-head">
        <span className="gauge-title mono">REVENGE RISK</span>
        <span className="gauge-live"><span className="live-dot" /> LIVE</span>
      </div>

      <svg className="gauge-svg" viewBox="0 0 200 120" role="img" aria-label={`Revenge risk ${shown} percent`}>
        <path d="M 20 105 A 80 80 0 0 1 180 105" className="gauge-track" pathLength="100" />
        <motion.path
          d="M 20 105 A 80 80 0 0 1 180 105"
          className="gauge-arc"
          pathLength="100"
          style={{ strokeDasharray: 100, strokeDashoffset: dashOffset }}
        />
      </svg>

      <div className="gauge-readout">
        <span className="gauge-value mono">{shown}<small>%</small></span>
        <span className="gauge-threshold mono">LOCK AT 80%</span>
      </div>

      <motion.div
        key={locked ? 'locked' : 'open'}
        className={`gauge-status ${locked ? 'is-locked' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {locked ? (
          <><Lock size={15} /> HARD LOCK ENGAGED — step away</>
        ) : (
          <><ShieldCheck size={15} /> Execution permitted</>
        )}
      </motion.div>

      <div className="gauge-stats">
        <Stat label="Discipline" value={locked ? '33%' : '100%'} tone={locked ? 'down' : 'up'} />
        <Stat label="Losses in a row" value={locked ? '2' : '0'} tone={locked ? 'down' : 'flat'} />
        <Stat label="Re-entry gap" value={locked ? '5m' : '—'} tone={locked ? 'down' : 'flat'} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="gauge-stat">
      <span className="gauge-stat-label">{label}</span>
      <span className={`gauge-stat-value mono tone-${tone}`}>{value}</span>
    </div>
  );
}
