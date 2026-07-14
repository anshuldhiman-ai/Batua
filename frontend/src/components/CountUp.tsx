import React from "react";
import {
  useMotionValue,
  useSpring,
  useTransform,
  motion,
  useReducedMotion,
  animate,
} from "framer-motion";

/**
 * Animated number that springs from its previous value to the next whenever
 * `value` changes. Formatting is delegated to `format` so callers keep full
 * control (₹ symbol, compact notation, %, etc.) — see formatINR in
 * lib/utils-finance.
 *
 * Respects prefers-reduced-motion: renders the formatted value directly with
 * no animation.
 *
 * @param value    target numeric value
 * @param format   (n:number) => string — how to render the interpolating number
 * @param duration seconds for the tween fallback (spring ignores it)
 */
export default function CountUp({
  value = 0,
  format = (n) => String(Math.round(n)),
  duration = 0.9,
  className,
}) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    stiffness: 90,
    damping: 20,
    mass: 1,
  });
  const rounded = useTransform(spring, (latest) => format(latest));

  React.useEffect(() => {
    if (reduce) return;
    motionValue.set(value);
  }, [value, motionValue, reduce]);

  // On very first mount, run a quick tween from 0 so the number "arrives"
  // rather than snapping — but only for non-reduced-motion users.
  React.useEffect(() => {
    if (reduce) return;
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reduce) {
    return <span className={className}>{format(value)}</span>;
  }

  return <motion.span className={className}>{rounded}</motion.span>;
}
