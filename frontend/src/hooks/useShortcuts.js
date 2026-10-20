import { useEffect, useRef } from 'react';

// Global keyboard shortcuts.
//   n          start a pre-flight (or the cool-off screen when locked)
//   g then d   dashboard   ·  g then j  journal
//   g then s   strategy    ·  g then ,  settings
//   ?          show the shortcut list
export const SHORTCUTS = [
  { keys: ['N'], label: 'Start a pre-flight' },
  { keys: ['G', 'D'], label: 'Go to Dashboard' },
  { keys: ['G', 'J'], label: 'Go to Journal' },
  { keys: ['G', 'S'], label: 'Go to Strategy' },
  { keys: ['G', ','], label: 'Go to Settings' },
  { keys: ['?'], label: 'Show keyboard shortcuts' },
  { keys: ['Esc'], label: 'Close a dialog' },
];

const GO = { d: 'dashboard', j: 'journal', s: 'strategy', ',': 'settings' };
const SEQUENCE_MS = 1200;

const isTyping = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export default function useShortcuts({ onExecute, onNavigate, onHelp, enabled = true }) {
  const pendingG = useRef(0);
  const handlers = useRef({ onExecute, onNavigate, onHelp });
  handlers.current = { onExecute, onNavigate, onHelp };

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();

      if (pendingG.current && Date.now() - pendingG.current < SEQUENCE_MS && GO[key]) {
        pendingG.current = 0;
        e.preventDefault();
        handlers.current.onNavigate?.(GO[key]);
        return;
      }
      pendingG.current = 0;

      if (key === 'g') {
        pendingG.current = Date.now();
      } else if (key === 'n') {
        e.preventDefault();
        handlers.current.onExecute?.();
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        handlers.current.onHelp?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
