import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Plan 12 §9.5 — Reduced Motion swaps spatial transitions for short crossfades everywhere. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      if (active) setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

export { motion } from './tokens';
