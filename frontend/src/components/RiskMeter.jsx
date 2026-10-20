import React from 'react';
import { motion } from 'framer-motion';
import useCountUp from './useCountUp';
import './RiskMeter.css';

export const LOCK_THRESHOLD = 80;

export const riskTone = (value) =>
  value >= LOCK_THRESHOLD ? 'danger' : value >= 50 ? 'warning' : 'primary';

/** Semicircle revenge-risk gauge. */
export default function RiskMeter({ value = 0, label = 'Revenge risk' }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const shown = useCountUp(clamped);
  const tone = riskTone(clamped);

  return (
    <div className={`risk-meter tone-${tone}`}>
      <svg viewBox="0 0 200 116" role="img" aria-label={`${label} ${clamped} percent`}>
        <path d="M 20 105 A 80 80 0 0 1 180 105" className="risk-meter-track" pathLength="100" />
        <motion.path
          d="M 20 105 A 80 80 0 0 1 180 105"
          className="risk-meter-arc"
          pathLength="100"
          initial={{ strokeDashoffset: 100 }}
          animate={{ strokeDashoffset: 100 - clamped }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ strokeDasharray: 100 }}
        />
        {/* lock threshold tick */}
        <line x1="155.0" y1="65.0" x2="174.4" y2="50.9" className="risk-meter-tick" />
      </svg>
      <div className="risk-meter-readout">
        <span className="risk-meter-value mono">{Math.round(shown)}<small>%</small></span>
        <span className="risk-meter-label mono">{label} · lock at {LOCK_THRESHOLD}%</span>
      </div>
    </div>
  );
}
