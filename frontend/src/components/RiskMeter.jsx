import React from 'react';
import { motion } from 'framer-motion';
import useCountUp from './useCountUp';
import './RiskMeter.css';

export const LOCK_THRESHOLD = 80;

export const riskTone = (value, threshold = LOCK_THRESHOLD) =>
  value >= threshold ? 'danger' : value >= Math.min(50, threshold - 10) ? 'warning' : 'primary';

// Point on the gauge arc (centre 100,105, radius r) for a 0–100 value.
const arcPoint = (value, r) => {
  const angle = ((180 - (value / 100) * 180) * Math.PI) / 180;
  return [(100 + r * Math.cos(angle)).toFixed(1), (105 - r * Math.sin(angle)).toFixed(1)];
};

/** Semicircle revenge-risk gauge. `threshold` marks where the Hard Lock engages. */
export default function RiskMeter({ value = 0, threshold = LOCK_THRESHOLD, label = 'Revenge risk' }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const lockAt = Math.max(0, Math.min(100, Number(threshold) || LOCK_THRESHOLD));
  const shown = useCountUp(clamped);
  const tone = riskTone(clamped, lockAt);
  const [x1, y1] = arcPoint(lockAt, 68);
  const [x2, y2] = arcPoint(lockAt, 92);

  return (
    <div className={`risk-meter tone-${tone}`}>
      <svg viewBox="0 0 200 116" role="img" aria-label={`${label} ${clamped} percent, locks at ${lockAt} percent`}>
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
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="risk-meter-tick" />
      </svg>
      <div className="risk-meter-readout">
        <span className="risk-meter-value mono">{Math.round(shown)}<small>%</small></span>
        <span className="risk-meter-label mono">{label} · lock at {lockAt}%</span>
      </div>
    </div>
  );
}
