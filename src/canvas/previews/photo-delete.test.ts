import { describe, expect, it } from "vite-plus/test";

import {
  BALL_R,
  BIN,
  DEMO_SEED,
  FLOOR_Y,
  holdPoint,
  type Landing,
  planOutcome,
  planThrow,
  predictThrow,
  seeded,
  SIM_DT,
  slotOrigin,
  stepBody,
} from "./photo-delete";

/** Where each tile's ball sits when it's thrown. */
const starts = Array.from({ length: 6 }, (_, index) => {
  const origin = slotOrigin(index);
  return holdPoint({ x: origin.x + 76, y: origin.y + 72 });
});

describe("planThrow", () => {
  const cases: [Landing, (result: ReturnType<typeof predictThrow>) => boolean][] = [
    ["clean", (r) => r.inBin && r.rimHits === 0],
    ["rim", (r) => r.inBin && r.rimHits > 0],
    ["short", (r) => !r.inBin && r.x < BIN.cx - BIN.bottomHalf],
    ["rimOut", (r) => !r.inBin && r.rimHits > 0 && r.x < BIN.cx - BIN.bottomHalf],
  ];

  for (const [landing, holds] of cases) {
    it(`ends ${landing} from every tile, across seeds`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const rng = seeded(seed);
        for (const start of starts) {
          expect(holds(predictThrow(planThrow(rng, start.x, start.y, landing)))).toBe(true);
        }
      }
    });
  }
});

describe("stepBody", () => {
  it("lets a dropped ball settle on the floor without creeping", () => {
    const body = { x: 100, y: 100, vx: 0, vy: 0, w: 0 };
    for (let t = 0; t < 4; t += SIM_DT) stepBody(body, SIM_DT);
    expect(body.y).toBeCloseTo(FLOOR_Y - BALL_R, 0);
    expect(Math.abs(body.vy)).toBeLessThan(1);
    expect(Math.abs(body.x - 100)).toBeLessThan(0.5);
  });

  it("turns sliding into rolling through friction", () => {
    const body = { x: 40, y: FLOOR_Y - BALL_R, vx: 300, vy: 0, w: 0 };
    for (let t = 0; t < 0.1; t += SIM_DT) stepBody(body, SIM_DT);
    expect(body.w).toBeGreaterThan(0);
    expect(body.vx).toBeLessThan(300);
  });
});

describe("planOutcome", () => {
  it("replays the same run from the same seed", () => {
    const a = seeded(DEMO_SEED);
    const b = seeded(DEMO_SEED);
    for (let i = 0; i < 10; i++) expect(planOutcome(a)).toEqual(planOutcome(b));
  });

  it("opens the demo run with a success and then a failure", () => {
    const rng = seeded(DEMO_SEED);
    const first = planOutcome(rng);
    rng();
    const second = planOutcome(rng);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });
});
