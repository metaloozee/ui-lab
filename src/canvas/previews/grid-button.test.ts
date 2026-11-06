import { describe, expect, it } from "vite-plus/test";

import {
  labelShade,
  pointerLight,
  rippleLight,
  sweepCenter,
  tileNoise,
  weightFor,
} from "./grid-button";

describe("pointerLight", () => {
  it("is brightest under the pointer and fades with distance", () => {
    expect(pointerLight(0, 0)).toBeGreaterThan(pointerLight(15, 0));
    expect(pointerLight(15, 0)).toBeGreaterThan(0);
    expect(pointerLight(100, 0)).toBe(0);
  });

  it("reaches further and brighter with more weight", () => {
    expect(pointerLight(40, 0)).toBe(0);
    expect(pointerLight(40, 0.9)).toBeGreaterThan(0);
    expect(pointerLight(0, 0.9)).toBeGreaterThan(pointerLight(0, 0));
  });
});

describe("weightFor", () => {
  it("grows with speed and never passes 1", () => {
    expect(weightFor(0)).toBe(0);
    expect(weightFor(2)).toBeGreaterThan(weightFor(0.5));
    expect(weightFor(100)).toBeLessThanOrEqual(1);
  });
});

describe("rippleLight", () => {
  it("travels outward, lighting the ring rather than the center", () => {
    expect(rippleLight(0, 300, false)).toBe(0);
    expect(rippleLight(300 * 0.32, 300, false)).toBeGreaterThan(0.5);
  });

  it("stays in place under reduced motion and ends", () => {
    expect(rippleLight(0, 100, true)).toBeGreaterThan(0);
    expect(rippleLight(100, 100, true)).toBe(0);
    expect(rippleLight(0, 5000, true)).toBe(0);
    expect(rippleLight(400, 5000, false)).toBe(0);
  });
});

describe("labelShade", () => {
  it("dims tiles behind the label and ramps back to full outside it", () => {
    expect(labelShade(0, 0)).toBeLessThan(0.5);
    expect(labelShade(4, 0)).toBeGreaterThan(labelShade(0, 0));
    expect(labelShade(50, 0)).toBe(1);
    expect(labelShade(0, 20)).toBe(1);
  });

  it("fades over a longer run beside the label than above it", () => {
    expect(labelShade(6, 0)).toBeLessThan(labelShade(0, 6));
  });
});

describe("tileNoise", () => {
  it("is stable per tile and stays in range", () => {
    expect(tileNoise(3, 4, 1)).toBe(tileNoise(3, 4, 1));
    expect(tileNoise(3, 4, 1)).not.toBe(tileNoise(4, 3, 1));
    for (let i = 0; i < 50; i++) {
      const value = tileNoise(i, i * 7, 2);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("sweepCenter", () => {
  it("enters past the left edge, crosses, and starts over each period", () => {
    expect(sweepCenter(0, 200)).toBeLessThan(0);
    expect(sweepCenter(1299, 200)).toBeGreaterThan(200);
    expect(sweepCenter(650, 200)).toBeCloseTo(100, 0);
    expect(sweepCenter(1300 + 650, 200)).toBeCloseTo(sweepCenter(650, 200));
  });
});
