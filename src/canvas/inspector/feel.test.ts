import { expect, it } from "vite-plus/test";

import { DEFAULT_MOTION } from "@/lib/springs";

import { feelOf, withFeel } from "./feel";

it("recognizes each preset and keeps the speed setting when applying one", () => {
  const tuned = { ...DEFAULT_MOTION, timeScale: 0.5 };
  expect(feelOf(tuned)).toBe("default");
  const snappy = withFeel(tuned, "snappy");
  expect(feelOf(snappy)).toBe("snappy");
  expect(snappy.timeScale).toBe(0.5);
  expect(feelOf(withFeel(snappy, "default"))).toBe("default");
});

it("reports any hand-tuned value as custom", () => {
  const tuned = { ...DEFAULT_MOTION, fast: { ...DEFAULT_MOTION.fast, bounce: 0.2 } };
  expect(feelOf(tuned)).toBe("custom");
});
