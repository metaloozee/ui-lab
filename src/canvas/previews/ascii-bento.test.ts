import { describe, expect, it } from "vite-plus/test";

import { RAMP, glyphFor, pointerThinning, rippleThinning, weightFor } from "./ascii-bento";

describe("glyphFor", () => {
  it("rests at full ink and empties under full thinning", () => {
    expect(glyphFor(0)).toBe(RAMP.at(-1));
    expect(glyphFor(1)).toBe(" ");
  });

  it("clamps out-of-range thinning", () => {
    expect(glyphFor(-0.5)).toBe(RAMP.at(-1));
    expect(glyphFor(3)).toBe(" ");
  });
});

describe("pointerThinning", () => {
  it("is strongest under the pointer and fades with distance", () => {
    const near = pointerThinning(0, 0);
    const mid = pointerThinning(30, 0);
    const far = pointerThinning(200, 0);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBe(0);
  });

  it("reaches further and deeper with more weight", () => {
    expect(pointerThinning(80, 0)).toBe(0);
    expect(pointerThinning(80, 0.9)).toBeGreaterThan(0);
    expect(pointerThinning(0, 0.9)).toBeGreaterThan(pointerThinning(0, 0));
  });
});

describe("weightFor", () => {
  it("grows with speed and never reaches 1", () => {
    expect(weightFor(0)).toBe(0);
    expect(weightFor(2)).toBeGreaterThan(weightFor(0.5));
    expect(weightFor(100)).toBeLessThanOrEqual(1);
  });
});

describe("rippleThinning", () => {
  it("travels outward, thinning the ring rather than the center", () => {
    expect(rippleThinning(0, 300, false)).toBe(0);
    expect(rippleThinning(300 * 0.45, 300, false)).toBeGreaterThan(0.5);
  });

  it("stays in place under reduced motion and ends", () => {
    expect(rippleThinning(0, 100, true)).toBeGreaterThan(0);
    expect(rippleThinning(200, 100, true)).toBe(0);
    expect(rippleThinning(0, 5000, true)).toBe(0);
    expect(rippleThinning(400, 5000, false)).toBe(0);
  });
});
