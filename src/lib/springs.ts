export const spring = {
  fast: {
    type: "spring" as const,
    duration: 0.08,
    bounce: 0,
    exit: { duration: 0.06 },
  },
  // Critically damped: same perceived speed as a bouncier tier, but lands
  // exactly with no overshoot — for short travel and panels/sheets that must
  // settle precisely (dropdowns, tabs, drawers, merged selection backgrounds).
  moderate: {
    type: "spring" as const,
    duration: 0.16,
    bounce: 0,
    exit: { duration: 0.12 },
  },
  slow: {
    type: "spring" as const,
    duration: 0.24,
    bounce: 0.12,
    exit: { duration: 0.16 },
  },
};

export type SpringTier = keyof typeof spring;
export type SpringValues = { duration: number; bounce: number; exit: number };
export type ReducedMotion = "user" | "always" | "never";

/** Everything the Inspect panel can change. Tier values are stored before the time scale applies. */
export type MotionTuning = Record<SpringTier, SpringValues> & {
  timeScale: number;
  reducedMotion: ReducedMotion;
};

export const DEFAULT_MOTION: MotionTuning = {
  fast: { duration: 0.08, bounce: 0, exit: 0.06 },
  moderate: { duration: 0.16, bounce: 0, exit: 0.12 },
  slow: { duration: 0.24, bounce: 0.12, exit: 0.16 },
  timeScale: 1,
  reducedMotion: "user",
};

export const SPRING_TIERS = ["fast", "moderate", "slow"] as const;

let tuning = DEFAULT_MOTION;
const listeners = new Set<() => void>();

/**
 * Tokens are read when an animation starts, so writing to `spring` here retunes every component
 * without a rerender. Transitions written as CSS durations don't follow.
 */
export function applyMotionTuning(next: MotionTuning): void {
  tuning = next;
  for (const tier of SPRING_TIERS) {
    const values = next[tier];
    spring[tier].duration = values.duration / next.timeScale;
    spring[tier].bounce = values.bounce;
    spring[tier].exit.duration = values.exit / next.timeScale;
  }
  if (typeof document !== "undefined") {
    // For the few transitions that have to be CSS. "always" means no movement at all.
    const off = next.reducedMotion === "always";
    const root = document.documentElement.style;
    root.setProperty("--spring-fast", off ? "0s" : `${spring.fast.duration}s`);
    root.setProperty("--spring-moderate", off ? "0s" : `${spring.moderate.duration}s`);
  }
  for (const listener of listeners) listener();
}

export const getMotionTuning = (): MotionTuning => tuning;

export function subscribeToMotionTuning(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Fallback delay (ms) for deferred-unmount timers that guard an exit tween:
// popups keep their portal mounted until onAnimationComplete fires, but a
// throttled/background tab can stall the animation, so a timer force-unmounts
// after the tier's exit duration plus a safety buffer. Deriving it here keeps
// the timers in step with the tokens above.
export const exitFallbackMs = (tier: { exit: { duration: number } }) =>
  Math.round(tier.exit.duration * 1000) + 100;
