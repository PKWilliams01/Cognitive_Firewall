import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/**
 * Animates a number from its previous value to `target`.
 * Returns the current (unformatted) number.
 */
export default function useCountUp(target, { duration = 1.1, decimals = 0 } = {}) {
  const reduceMotion = useReducedMotion();
  const end = Number.isFinite(Number(target)) ? Number(target) : 0;
  const [value, setValue] = useState(reduceMotion ? end : 0);

  useEffect(() => {
    if (reduceMotion) {
      setValue(end);
      return undefined;
    }
    const controls = animate(value, end, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Number(v.toFixed(decimals))),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, duration, decimals, reduceMotion]);

  return value;
}
