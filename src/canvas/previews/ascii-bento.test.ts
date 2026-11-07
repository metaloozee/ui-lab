import { describe, expect, it } from "vite-plus/test";

import {
  RAMP,
  disturbedInk,
  edgeGlyph,
  pruneSpecks,
  glyphFor,
  pointerThinning,
  rippleThinning,
  sliverGlyph,
  traceOutline,
  weightFor,
} from "./ascii-bento";

describe("glyphFor", () => {
  it("maps no ink to blank and full ink to the heaviest glyph, clamping beyond", () => {
    expect(glyphFor(0)).toBe(" ");
    expect(glyphFor(1)).toBe(RAMP.at(-1));
    expect(glyphFor(-0.5)).toBe(" ");
    expect(glyphFor(3)).toBe(RAMP.at(-1));
  });
});

describe("edgeGlyph", () => {
  it("traces the outline across the slope of coverage", () => {
    expect(edgeGlyph(1, 0)).toBe("|");
    expect(edgeGlyph(-1, 0)).toBe("|");
    expect(edgeGlyph(0, 1)).toBe("-");
    expect(edgeGlyph(0, -1)).toBe("-");
  });

  it("leans with diagonal edges, y pointing down", () => {
    // Filled below and right of the edge: the edge rises to the right.
    expect(edgeGlyph(1, 1)).toBe("/");
    expect(edgeGlyph(-1, -1)).toBe("/");
    // Filled below and left: the edge falls to the right.
    expect(edgeGlyph(-1, 1)).toBe("\\");
  });
});

describe("disturbedInk", () => {
  it("empties the mark and lifts the quiet field toward a faint glyph", () => {
    expect(disturbedInk(0.9, 1)).toBe(0);
    expect(disturbedInk(0.9, 0)).toBe(0.9);
    expect(disturbedInk(0, 1)).toBeGreaterThan(0);
    expect(glyphFor(disturbedInk(0, 1))).not.toBe(" ");
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

/** Coverage per 10 by 14 cell of an upright 60 degree triangle, its apex at (`apexX`, `apexY`) px. */
function triangle(cols: number, rows: number, apexX: number, apexY: number): Float32Array {
  const coverage = new Float32Array(cols * rows);
  const slope = Math.tan(Math.PI / 6);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let hits = 0;
      for (let a = 0; a < 8; a++) {
        for (let b = 0; b < 8; b++) {
          const x = col * 10 + ((a + 0.5) * 10) / 8;
          const y = row * 14 + ((b + 0.5) * 14) / 8;
          if (y > apexY && Math.abs(x - apexX) <= (y - apexY) * slope) hits++;
        }
      }
      coverage[row * cols + col] = hits / 64;
    }
  }
  return coverage;
}

describe("traceOutline", () => {
  it("points the apex and gives each side one stroke per row, down to the grid's edge", () => {
    const cols = 30;
    const rows = 14;
    // Apex at the center of column 15, just inside row 1.
    const strokes = traceOutline(triangle(cols, rows, 155, 12), cols, rows);
    const line = (row: number) => strokes.slice(row * cols, (row + 1) * cols).join("");
    expect(line(0)).toBe("");
    expect(line(1)).toBe("^");
    for (let row = 3; row < rows; row++) expect(line(row)).toBe("/\\");
  });

  it("points a tip that falls between two cells", () => {
    const cols = 30;
    const rows = 10;
    // Apex on the border between columns 14 and 15.
    const strokes = traceOutline(triangle(cols, rows, 150, 12), cols, rows);
    const line = (row: number) => strokes.slice(row * cols, (row + 1) * cols).join("");
    expect(line(1)).toBe("/\\");
    for (let row = 2; row < rows; row++) expect(line(row)).toBe("/\\");
  });

  it("leaves no outline where the mark runs off the grid", () => {
    const cols = 4;
    const rows = 4;
    const strokes = traceOutline(new Float32Array(cols * rows).fill(1), cols, rows);
    expect(strokes.every((stroke) => stroke === "")).toBe(true);
  });
});

describe("sliverGlyph", () => {
  const from = (rows: string[]) => (dc: number, dr: number) => rows[dr + 1]?.[dc + 1] === "#";

  it("follows a thin band along its run", () => {
    expect(sliverGlyph(from(["#..", ".#.", "..#"]))).toBe("\\");
    expect(sliverGlyph(from(["..#", ".#.", "#.."]))).toBe("/");
    expect(sliverGlyph(from([".#.", ".#.", ".#."]))).toBe("|");
    expect(sliverGlyph(from(["...", "###", "..."]))).toBe("-");
  });

  it("points a tip away from the body", () => {
    expect(sliverGlyph(from(["...", ".#.", "###"]))).toBe("^");
    expect(sliverGlyph(from(["###", ".#.", "..."]))).toBe("v");
  });
});

describe("pruneSpecks", () => {
  it("trims a thin band's frayed ends but keeps cells at the grid's edge", () => {
    const cols = 6;
    const rows = 5;
    const coverage = new Float32Array(cols * rows);
    const at = (col: number, row: number) => row * cols + col;
    for (const [col, row] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [0, 4],
    ] as const)
      coverage[at(col, row)] = 1;
    pruneSpecks(coverage, cols, rows);
    expect(coverage[at(1, 1)]).toBe(0);
    expect(coverage[at(2, 2)]).toBe(1);
    expect(coverage[at(3, 3)]).toBe(0);
    expect(coverage[at(0, 4)]).toBe(1);
  });

  it("removes a cell with no inside neighbor", () => {
    const coverage = new Float32Array(9);
    coverage[4] = 1;
    pruneSpecks(coverage, 3, 3);
    expect(coverage[4]).toBe(0);
  });
});
