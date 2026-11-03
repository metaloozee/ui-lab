// oxlint-disable ui-lab/motion-tokens -- These presets are the values the spring tokens get set to.
import {
  DEFAULT_MOTION,
  type MotionTuning,
  SPRING_TIERS,
  type SpringTier,
  type SpringValues,
} from "@/lib/springs";

export type Feel = "snappy" | "default" | "slow" | "custom";

export const FEELS: readonly { value: Feel; label: string }[] = [
  { value: "snappy", label: "Snappy" },
  { value: "default", label: "Default" },
  { value: "slow", label: "Slow" },
];

const PRESETS: Record<Exclude<Feel, "custom">, Record<SpringTier, SpringValues>> = {
  snappy: {
    fast: { duration: 0.05, bounce: 0, exit: 0.04 },
    moderate: { duration: 0.1, bounce: 0, exit: 0.08 },
    slow: { duration: 0.16, bounce: 0.06, exit: 0.1 },
  },
  default: {
    fast: DEFAULT_MOTION.fast,
    moderate: DEFAULT_MOTION.moderate,
    slow: DEFAULT_MOTION.slow,
  },
  slow: {
    fast: { duration: 0.16, bounce: 0, exit: 0.12 },
    moderate: { duration: 0.32, bounce: 0, exit: 0.24 },
    slow: { duration: 0.5, bounce: 0.18, exit: 0.32 },
  },
};

const matches = (tuning: MotionTuning, preset: Record<SpringTier, SpringValues>) =>
  SPRING_TIERS.every((tier) =>
    (["duration", "bounce", "exit"] as const).every(
      (key) => tuning[tier][key] === preset[tier][key],
    ),
  );

export function feelOf(tuning: MotionTuning): Feel {
  for (const { value } of FEELS) {
    if (value !== "custom" && matches(tuning, PRESETS[value])) return value;
  }
  return "custom";
}

export function withFeel(tuning: MotionTuning, feel: Exclude<Feel, "custom">): MotionTuning {
  return { ...tuning, ...PRESETS[feel] };
}

export async function copyMotionTokens(tuning: MotionTuning): Promise<"copied" | "failed"> {
  const lines = SPRING_TIERS.map((tier) => {
    const { duration, bounce, exit } = tuning[tier];
    return `  ${tier}: { type: "spring", duration: ${duration}, bounce: ${bounce}, exit: { duration: ${exit} } },`;
  });
  try {
    await navigator.clipboard.writeText(`export const spring = {\n${lines.join("\n")}\n};`);
    return "copied";
  } catch {
    return "failed";
  }
}
