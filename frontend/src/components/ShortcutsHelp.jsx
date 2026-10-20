import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { SHORTCUTS } from '../hooks/useShortcuts';
import './ShortcutsHelp.css';

export default function ShortcutsHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div className="guide-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="keys-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="keys-head">
          <Keyboard size={18} />
          <h2 id="keys-title">Keyboard shortcuts</h2>
          <button className="shell-icon-btn" onClick={onClose} aria-label="Close shortcuts"><X size={16} /></button>
        </header>
        <ul className="keys-list">
          {SHORTCUTS.map((s) => (
            <li key={s.label}>
              <span>{s.label}</span>
              <span className="keys-combo">
                {s.keys.map((k, i) => (
                  <React.Fragment key={k}>
                    {i > 0 && <span className="keys-then">then</span>}
                    <kbd>{k}</kbd>
                  </React.Fragment>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
