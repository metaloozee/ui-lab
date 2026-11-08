import { describe, expect, it } from "vite-plus/test";

import {
  labelShade,
  pointerLight,
  rippleLight,
  tileNoise,
  waveHeight,
  waveLight,
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

describe("waveHeight", () => {
  it("rises from the floor as a load begins, then rides between its low and full height", () => {
    expect(waveHeight(0, 0, false)).toBe(0);
    for (let at = 400; at < 3000; at += 37) {
      const height = waveHeight(3, at, false);
      expect(height).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(height).toBeLessThanOrEqual(1);
    }
  });

  it("travels outward: a farther column reaches the same height later", () => {
    expect(waveHeight(4.5, 1000 + 550, false)).toBeCloseTo(waveHeight(0, 1000, false));
  });

  it("holds still under reduced motion", () => {
    expect(waveHeight(2, 0, true)).toBe(waveHeight(2, 5000, true));
  });
});

describe("waveLight", () => {
  it("lights whole tiles below the height and the top tile in part", () => {
    expect(waveLight(0, 2.4)).toBe(1);
    expect(waveLight(2, 2.4)).toBeCloseTo(0.4);
    expect(waveLight(3, 2.4)).toBe(0);
  });
});
