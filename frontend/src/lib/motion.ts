// Shared framer-motion presets so every surface in the app moves with the same
// rhythm. Import these instead of redefining variants per component — same idea
// as the shared chart tokens in Charts.tsx.
//
// Everything here honours `prefers-reduced-motion`: when the user has asked for
// reduced motion, framer-motion's `useReducedMotion()` should be used at the
// call site to swap in `noMotion`, or wrap the whole tree in MotionConfig
// (see main.tsx / App.tsx).

import type { Variants, Transition } from "framer-motion";

/** Springy, expressive default — used for hover/press and layout shifts. */
export const spring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

/** Softer spring for larger elements (cards, panels). */
export const softSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
};

/** Smooth easing curve matching the app's existing page-enter cubic-bezier. */
export const ease: Transition = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * Stagger container — children with `fadeUp`/`scaleIn` cascade in.
 * Usage: <motion.div variants={staggerContainer} initial="hidden" animate="show">
 */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
};

/** Fade + rise — the app's signature entrance for cards and rows. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: ease,
  },
};

/** Scale + fade — for KPI tiles and badges that should "pop" in. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: softSpring,
  },
};

/** Slide from the left — for list rows and nav items. */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: ease },
};

/** Spring hover/tap preset for interactive cards. Spread into a motion element. */
export const hoverLift = {
  whileHover: { y: -4, scale: 1.015 },
  whileTap: { scale: 0.985 },
  transition: spring,
};

/** No-op variants for reduced-motion — elements simply appear. */
export const noMotion: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1 },
};
