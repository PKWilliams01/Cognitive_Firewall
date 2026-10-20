import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Target, Brain, Activity, Shield, PieChart } from 'lucide-react';
import './Guidebook.css';

const SECTIONS = [
  {
    icon: Target,
    tone: 'up',
    title: 'Strategy Adherence',
    metric: 'Starts at 100%',
    desc: 'Your daily discipline score. You start at 100% every midnight. You lose points if you skip your pre-trade checklist or risk too much capital on a single trade.',
  },
  {
    icon: Brain,
    tone: 'down',
    title: 'Revenge Risk',
    metric: 'Starts at 0%',
    desc: 'Your emotional temperature gauge. It spikes if you start rapid-firing trades right after taking a loss. If it gets too high, the firewall locks you out to force a cool-down.',
  },
  {
    icon: Activity,
    tone: 'info',
    title: 'Impulsivity Index',
    metric: 'Target: < 1.0x',
    desc: 'Your overtrading alert. It compares the trades you actually took against your daily limit. If your limit is 3 and you take 6, you hit 2.0x—a massive red flag for impulsivity.',
  },
  {
    icon: PieChart,
    tone: 'accent',
    title: 'Disposition Ratio',
    metric: 'Target: < 1.0',
    desc: "The 'hope versus fear' tracker. It measures if you are cutting your winning trades too early out of fear, while holding onto your losing trades for way too long out of hope.",
  },
];

export default function Guidebook({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="guide-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="guide-head">
          <span className="guide-icon"><Shield size={22} /></span>
          <div>
            <h2 id="guide-title">Operator's Manual</h2>
            <p>How your firewall reads your behaviour</p>
          </div>
          <button className="shell-icon-btn guide-close" onClick={onClose} aria-label="Close manual">
            <X size={18} />
          </button>
        </header>

        <div className="guide-body">
          {SECTIONS.map((s, i) => (
            <motion.section
              key={s.title}
              className={`guide-section g-${s.tone}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.35 }}
            >
              <div className="guide-section-head">
                <span className="guide-section-icon"><s.icon size={17} /></span>
                <h3>{s.title}</h3>
                <span className="badge badge-neutral">{s.metric}</span>
              </div>
              <p>{s.desc}</p>
            </motion.section>
          ))}
        </div>

        <footer className="guide-foot">
          <button className="btn btn-primary" onClick={onClose}>I understand</button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
