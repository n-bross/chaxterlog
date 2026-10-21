"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// After interior.dev's value-flash: the old value leaves the way the count moved,
// the new one arrives from the other side. Springs keep rapid taps interruptible.
const ROLL = { type: "spring", stiffness: 520, damping: 34, mass: 0.5 } as const;
const DROP = { duration: 0.14, ease: [0.4, 0, 1, 1] } as const;
const STILL = { duration: 0 } as const;

export default function RollingNumber({ value, className = "" }: { value: number | null; className?: string }) {
  const reduced = useReducedMotion();
  // Derived from the previous render (React's "storing information from previous renders").
  const [previous, setPrevious] = useState(value);
  const [d, setDirection] = useState<1 | -1>(1);
  if (previous !== value) {
    setPrevious(value);
    setDirection(value !== null && previous !== null && value < previous ? -1 : 1);
  }
  // `custom` reaches the exiting digit too, so it always leaves the way the count moved now.
  const variants = {
    enter: (dir: number) => (reduced ? { opacity: 0 } : { opacity: 0, y: `${0.55 * dir}em`, filter: "blur(4px)" }),
    center: { opacity: 1, y: "0em", filter: "blur(0px)", transition: reduced ? STILL : ROLL },
    exit: (dir: number) => (reduced ? { opacity: 0, transition: STILL } : { opacity: 0, y: `${-0.45 * dir}em`, filter: "blur(3px)", transition: DROP }),
  };
  return (
    <span className={`rolling-number ${className}`}>
      <AnimatePresence initial={false} mode="popLayout" custom={d}>
        <motion.span key={value ?? "none"} custom={d} variants={variants} initial="enter" animate="center" exit="exit">
          {value ?? "–"}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
