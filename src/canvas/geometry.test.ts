import { describe, expect, it } from "vite-plus/test";

import {
  clampCamera,
  findOpenSpot,
  landingFor,
  magnetize,
  fitCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  nearestFreeSpot,
  type Rect,
  revealCamera,
  snapToNeighbors,
  zoomAround,
} from "./geometry";

const toWorld = (camera: { x: number; y: number; zoom: number }, x: number, y: number) => ({
  x: (x - camera.x) / camera.zoom,
  y: (y - camera.y) / camera.zoom,
});

describe("zoomAround", () => {
  it("keeps the anchored canvas point fixed through repeated zooms in both directions", () => {
    const start = { x: 137, y: -42, zoom: 0.8 };
    const before = toWorld(start, 500, 320);
    let camera = start;
    for (const zoom of [1.3, 2.9, 3.7, 0.4, 0.15, 1.1]) {
      camera = zoomAround(camera, { x: 500, y: 320 }, zoom);
    }
    const after = toWorld(camera, 500, 320);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("does not drift the anchor when the zoom limit is hit", () => {
    const start = { x: 10, y: 20, zoom: 3.9 };
    const camera = zoomAround(start, { x: 300, y: 300 }, 100);
    expect(camera.zoom).toBe(MAX_ZOOM);
    expect(toWorld(camera, 300, 300).x).toBeCloseTo(toWorld(start, 300, 300).x, 6);
  });
});

describe("clampCamera", () => {
  it("bounds runaway values", () => {
    const camera = clampCamera({ x: 1e12, y: -1e12, zoom: 0.001 });
    expect(Math.abs(camera.x)).toBeLessThan(1e12);
    expect(Math.abs(camera.y)).toBeLessThan(1e12);
    expect(camera.zoom).toBe(MIN_ZOOM);
  });
});

describe("fitCamera", () => {
  const viewport = { width: 1000, height: 800 };

  it("centers small content without zooming past 100%", () => {
    const camera = fitCamera({ x: 0, y: 0, width: 200, height: 100 }, viewport, 40);
    expect(camera).toEqual({ x: 400, y: 350, zoom: 1 });
  });

  it("zooms out until the whole bounds fit inside the padding", () => {
    const bounds = { x: -3000, y: 500, width: 4000, height: 1000 };
    const camera = fitCamera(bounds, viewport, 50);
    expect(camera.x + bounds.x * camera.zoom).toBeGreaterThanOrEqual(50 - 1e-6);
    expect(camera.x + (bounds.x + bounds.width) * camera.zoom).toBeLessThanOrEqual(950 + 1e-6);
  });
});

describe("revealCamera", () => {
  const viewport = { width: 1000, height: 800 };

  it("leaves the camera alone when the rect is already visible", () => {
    const camera = { x: 100, y: 100, zoom: 1 };
    expect(revealCamera(camera, { x: 0, y: 0, width: 50, height: 50 }, viewport, 20)).toEqual(
      camera,
    );
  });

  it("brings an offscreen rect just inside the padding", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const next = revealCamera(camera, { x: 2000, y: 0, width: 100, height: 50 }, viewport, 20);
    expect(next.x + 2100).toBe(980);
    expect(next.zoom).toBe(1);
  });

  it("zooms out when the rect is larger than the viewport", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const next = revealCamera(camera, { x: 0, y: 0, width: 4000, height: 100 }, viewport, 20);
    expect(next.zoom).toBeCloseTo(960 / 4000);
  });
});

describe("findOpenSpot", () => {
  it("keeps the requested spot when it is free", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(findOpenSpot(rect, [{ x: 500, y: 0, width: 100, height: 100 }], 24)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("slides past a chain of overlapping items", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const occupied = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 130, y: 0, width: 100, height: 100 },
    ];
    expect(findOpenSpot(rect, occupied, 24)).toEqual({ x: 254, y: 0 });
  });
});

describe("nearestFreeSpot", () => {
  const overlaps = (a: Rect, b: Rect, gap: number) =>
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap;

  it("leaves a rect alone when it is already clear", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(nearestFreeSpot(rect, [{ x: 500, y: 0, width: 100, height: 100 }], 24)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("snaps to the closest side of what it hits", () => {
    const blocker = { x: 0, y: 0, width: 200, height: 200 };
    const nearRightEdge = { x: 150, y: 50, width: 100, height: 100 };
    expect(nearestFreeSpot(nearRightEdge, [blocker], 24)).toEqual({ x: 224, y: 50 });
    const nearTopEdge = { x: 50, y: -60, width: 100, height: 100 };
    expect(nearestFreeSpot(nearTopEdge, [blocker], 24)).toEqual({ x: 50, y: -124 });
  });

  it("never lands on a neighbor when snapping out of a crowded spot", () => {
    const occupied: Rect[] = [];
    for (let column = 0; column < 6; column += 1) {
      for (let row = 0; row < 6; row += 1) {
        occupied.push({ x: column * 260, y: row * 160, width: 240, height: 140 });
      }
    }
    for (let x = -300; x < 1800; x += 137) {
      for (let y = -200; y < 1100; y += 91) {
        const rect = { x, y, width: 300, height: 200 };
        const spot = nearestFreeSpot(rect, occupied, 24);
        const moved = { ...rect, ...spot };
        expect(occupied.some((other) => overlaps(moved, other, 24))).toBe(false);
      }
    }
  });
});

describe("snapToNeighbors", () => {
  const neighbor = {
    frame: { x: 500, y: 100, width: 200, height: 100 },
    bounds: { x: 500, y: 74, width: 200, height: 126 },
  };
  const options = { threshold: 8, gap: 24, labelHeight: 26 };

  it("lines up with a nearby edge and reports a guide spanning both items", () => {
    const frame = { x: 100, y: 105, width: 100, height: 50 };
    const { dx, dy, guides } = snapToNeighbors(frame, [neighbor], options);
    expect(dx).toBe(0);
    expect(dy).toBe(-5);
    expect(guides).toEqual([{ axis: "y", at: 100, start: 100, end: 700 }]);
  });

  it("aligns centers", () => {
    const frame = { x: 100, y: 122, width: 100, height: 50 };
    expect(snapToNeighbors(frame, [neighbor], options).dy).toBe(3);
  });

  it("settles beside a neighbor at the standard gap", () => {
    const frame = { x: 300, y: 400, width: 170, height: 50 };
    const { dx } = snapToNeighbors(frame, [neighbor], options);
    expect(dx).toBe(6);
  });

  it("leaves a frame alone when nothing is in range", () => {
    const frame = { x: 100, y: 400, width: 100, height: 50 };
    expect(snapToNeighbors(frame, [neighbor], options)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("ignores neighbors that are too far away to relate to", () => {
    const frame = { x: 100, y: 105, width: 100, height: 50 };
    expect(snapToNeighbors(frame, [neighbor], { ...options, reach: 100 }).dy).toBe(0);
    expect(snapToNeighbors(frame, [neighbor], { ...options, reach: 400 }).dy).toBe(-5);
  });

  it("prefers the closest candidate", () => {
    const frame = { x: 494, y: 400, width: 200, height: 50 };
    expect(snapToNeighbors(frame, [neighbor], options).dx).toBe(6);
    expect(snapToNeighbors({ ...frame, x: 497 }, [neighbor], options).dx).toBe(3);
  });
});

describe("landingFor", () => {
  const neighbor = {
    frame: { x: 500, y: 100, width: 200, height: 100 },
    bounds: { x: 500, y: 74, width: 200, height: 126 },
  };
  const frame = { x: 0, y: 0, width: 100, height: 60 };
  const bounds = { x: 0, y: -26, width: 100, height: 86 };
  const base = { frame, bounds, neighbors: [neighbor], gap: 24, threshold: 8, snap: true };

  it("stays put in open space with nothing to line up with", () => {
    const landing = landingFor({ ...base, desired: { x: 100, y: 400 } });
    expect(landing).toEqual({ x: 100, y: 400, guides: [] });
  });

  it("clears a neighbor it is dropped on, counting the label row", () => {
    const landing = landingFor({ ...base, desired: { x: 540, y: 120 } });
    const moved = { ...bounds, x: landing.x, y: landing.y - 26 };
    const hit =
      moved.x < 724 && moved.x + moved.width > 476 && moved.y < 224 && moved.y + moved.height > 50;
    expect(hit).toBe(false);
  });

  it("lines up when clear, and turns off with snap", () => {
    const desired = { x: 100, y: 105 };
    expect(landingFor({ ...base, desired }).y).toBe(100);
    expect(landingFor({ ...base, desired }).guides).toHaveLength(1);
    expect(landingFor({ ...base, desired, snap: false })).toEqual({ ...desired, guides: [] });
  });
});

describe("magnetize", () => {
  it("pulls only the axes in range", () => {
    expect(magnetize({ x: 10, y: 100 }, { x: 15, y: 300 }, 8)).toEqual({ x: 15, y: 100 });
    expect(magnetize({ x: 10, y: 100 }, { x: 50, y: 300 }, 8)).toEqual({ x: 10, y: 100 });
  });
});
