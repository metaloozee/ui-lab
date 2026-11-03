import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_MOTION } from "@/lib/springs";

import { MAX_COORDINATE, MAX_ZOOM } from "./geometry";
import { DEFAULT_PREFERENCES, parseLayout, serializeLayout } from "./layout-storage";

const ids = new Set(["a", "b"]);

describe("parseLayout", () => {
  it("round-trips a saved layout", () => {
    const raw = serializeLayout({
      camera: { x: 10, y: -20, zoom: 1.5 },
      preferences: {
        theme: "dark",
        accent: "pink",
        shape: "pill",
        density: "compact",
        motion: { ...DEFAULT_MOTION, timeScale: 0.5, reducedMotion: "always" },
      },
      positions: new Map([["a", { x: 1, y: 2 }]]),
    });
    const layout = parseLayout(raw, ids);
    expect(layout.camera).toEqual({ x: 10, y: -20, zoom: 1.5 });
    expect(layout.preferences).toEqual({
      theme: "dark",
      accent: "pink",
      shape: "pill",
      density: "compact",
      motion: { ...DEFAULT_MOTION, timeScale: 0.5, reducedMotion: "always" },
    });
    expect(layout.positions.get("a")).toEqual({ x: 1, y: 2 });
  });

  it.each([
    ["missing", null],
    ["malformed JSON", "{nope"],
    ["a non-object", "[1,2]"],
    ["an unknown version", JSON.stringify({ version: 99, theme: "dark" })],
    ["an oversized document", " ".repeat(300_000)],
  ])("falls back to defaults for %s", (_label, raw) => {
    const layout = parseLayout(raw, ids);
    expect(layout.camera).toBeNull();
    expect(layout.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(layout.positions.size).toBe(0);
  });

  it("drops stale ids and invalid values but keeps the valid remainder", () => {
    const layout = parseLayout(
      JSON.stringify({
        version: 1,
        camera: { x: "nope", y: 0, zoom: 1 },
        theme: "neon",
        accent: "chartreuse",
        positions: { a: { x: 5, y: 6 }, b: { x: null, y: 6 }, removed: { x: 1, y: 1 } },
      }),
      ids,
    );
    expect(layout.camera).toBeNull();
    expect(layout.preferences.theme).toBe(DEFAULT_PREFERENCES.theme);
    expect(layout.preferences.accent).toBe(DEFAULT_PREFERENCES.accent);
    expect([...layout.positions.keys()]).toEqual(["a"]);
  });

  it("clamps out-of-range values", () => {
    const layout = parseLayout(
      JSON.stringify({
        version: 1,
        camera: { x: 0, y: 0, zoom: 900 },
        positions: { a: { x: 1e12, y: -1e12 } },
      }),
      ids,
    );
    expect(layout.camera?.zoom).toBe(MAX_ZOOM);
    expect(layout.positions.get("a")).toEqual({ x: MAX_COORDINATE, y: -MAX_COORDINATE });
  });

  it("bounds tuned springs and falls back on invalid ones", () => {
    const { motion } = parseLayout(
      JSON.stringify({
        version: 1,
        motion: {
          timeScale: 0,
          reducedMotion: "sometimes",
          fast: { duration: 90, bounce: -2, exit: "x" },
          slow: "nope",
        },
      }),
      ids,
    ).preferences;
    expect(motion.timeScale).toBe(0.05);
    expect(motion.reducedMotion).toBe("user");
    expect(motion.fast).toEqual({ duration: 3, bounce: 0, exit: DEFAULT_MOTION.fast.exit });
    expect(motion.slow).toEqual(DEFAULT_MOTION.slow);
  });

  it("does not read ids from the prototype chain", () => {
    const layout = parseLayout(
      JSON.stringify({ version: 1, positions: {} }),
      new Set(["constructor"]),
    );
    expect(layout.positions.size).toBe(0);
  });
});
