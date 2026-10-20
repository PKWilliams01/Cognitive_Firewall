import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, CircleAlert, Info, Lock, X } from 'lucide-react';
import './Toast.css';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info, lock: Lock };

const noop = () => {};
const ToastContext = createContext({ success: noop, error: noop, info: noop, lock: noop, dismiss: noop });

export const useToast = () => useContext(ToastContext);

/** App-wide toast notifications (replaces browser alert()). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback((kind, message, { duration = kind === 'error' || kind === 'lock' ? 6000 : 3800 } = {}) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-3), { id, kind, message }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
    lock: (m, o) => push('lock', m, o),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.kind] || Info;
            return (
              <motion.div
                key={t.id}
                layout
                className={`toast toast-${t.kind}`}
                role={t.kind === 'error' || t.kind === 'lock' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <Icon size={17} className="toast-icon" />
                <span className="toast-msg">{t.message}</span>
                <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
