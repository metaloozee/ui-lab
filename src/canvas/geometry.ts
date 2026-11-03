export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = Point & Size;
export type Camera = Point & { zoom: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const MAX_COORDINATE = 1_000_000;
const MAX_CAMERA_OFFSET = MAX_COORDINATE * MAX_ZOOM;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function clampCoordinate(value: number): number {
  return clamp(value, -MAX_COORDINATE, MAX_COORDINATE);
}

export function clampCamera(camera: Camera): Camera {
  return {
    x: clamp(camera.x, -MAX_CAMERA_OFFSET, MAX_CAMERA_OFFSET),
    y: clamp(camera.y, -MAX_CAMERA_OFFSET, MAX_CAMERA_OFFSET),
    zoom: clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM),
  };
}

export function zoomAround(camera: Camera, anchor: Point, nextZoom: number): Camera {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = zoom / camera.zoom;
  return clampCamera({
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
    zoom,
  });
}

export function resetCamera(viewport: Size): Camera {
  return { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function fitCamera(bounds: Rect, viewport: Size, padding: number, maxZoom = 1): Camera {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    MIN_ZOOM,
    maxZoom,
  );
  return clampCamera({
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  });
}

/** The smallest camera move that brings `rect` into view, zooming out only if it cannot fit. */
export function revealCamera(camera: Camera, rect: Rect, viewport: Size, padding: number): Camera {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = clamp(
    Math.min(camera.zoom, availableWidth / rect.width, availableHeight / rect.height),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  const scale = zoom / camera.zoom;
  const center = {
    x: viewport.width / 2 - (viewport.width / 2 - camera.x) * scale,
    y: viewport.height / 2 - (viewport.height / 2 - camera.y) * scale,
  };
  const shift = (start: number, length: number, viewportLength: number) => {
    const end = start + length;
    if (start < padding) return padding - start;
    if (end > viewportLength - padding) return viewportLength - padding - end;
    return 0;
  };
  return clampCamera({
    x: center.x + shift(center.x + rect.x * zoom, rect.width * zoom, viewport.width),
    y: center.y + shift(center.y + rect.y * zoom, rect.height * zoom, viewport.height),
    zoom,
  });
}

function intersects(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

/** Slides `rect` right past whatever it overlaps. Never moves anything else. */
export function findOpenSpot(rect: Rect, occupied: readonly Rect[], gap: number): Point {
  const placed = { ...rect };
  for (let i = 0; i <= occupied.length; i += 1) {
    const hits = occupied.filter((other) => intersects(placed, other, gap));
    if (hits.length === 0) break;
    placed.x = Math.max(...hits.map((other) => other.x + other.width)) + gap;
  }
  return { x: placed.x, y: placed.y };
}

/**
 * The closest position to `rect` that clears everything in `occupied` by `gap`. The nearest free
 * position always sits flush against some item's side, so only those lines need testing. Nearby
 * items are tried first, which keeps this cheap enough to run on every pointer move.
 */
export function nearestFreeSpot(rect: Rect, occupied: readonly Rect[], gap: number): Point {
  const isFree = (x: number, y: number) =>
    !occupied.some((other) => intersects({ ...rect, x, y }, other, gap));
  if (isFree(rect.x, rect.y)) return { x: rect.x, y: rect.y };

  const search = (candidates: readonly Rect[]): Point | null => {
    const xs = [
      rect.x,
      ...candidates.flatMap((o) => [o.x - rect.width - gap, o.x + o.width + gap]),
    ];
    const ys = [
      rect.y,
      ...candidates.flatMap((o) => [o.y - rect.height - gap, o.y + o.height + gap]),
    ];
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (const x of xs) {
      for (const y of ys) {
        const distance = (x - rect.x) ** 2 + (y - rect.y) ** 2;
        if (distance < bestDistance && isFree(x, y)) {
          best = { x, y };
          bestDistance = distance;
        }
      }
    }
    return best;
  };

  const reach = Math.max(rect.width, rect.height) + gap * 2;
  const near = occupied.filter((other) => intersects(rect, other, reach));
  // Left of everything at the same height is always free, so the full search can't come up empty.
  return search(near) ?? search(occupied) ?? { x: rect.x, y: rect.y };
}

export type SnapNeighbor = { frame: Rect; bounds: Rect };
export type SnapGuide = { axis: "x" | "y"; at: number; start: number; end: number };
export type SnapResult = { dx: number; dy: number; guides: SnapGuide[] };

type SnapCandidate = { delta: number; at: number; neighbor: SnapNeighbor };

function closest(candidates: SnapCandidate[], threshold: number): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  for (const candidate of candidates) {
    if (Math.abs(candidate.delta) > threshold) continue;
    if (!best || Math.abs(candidate.delta) < Math.abs(best.delta)) best = candidate;
  }
  return best;
}

/**
 * Pulls a dragged frame onto what lines up nearby: neighbors' edges and centers, and the standard
 * gap beside them. `labelHeight` is the row above a frame, which counts toward the gap.
 */
export function snapToNeighbors(
  frame: Rect,
  neighbors: readonly SnapNeighbor[],
  {
    threshold,
    gap,
    labelHeight,
    reach = Infinity,
  }: { threshold: number; gap: number; labelHeight: number; reach?: number },
): SnapResult {
  const left = frame.x;
  const right = frame.x + frame.width;
  const centerX = frame.x + frame.width / 2;
  const top = frame.y;
  const bottom = frame.y + frame.height;
  const centerY = frame.y + frame.height / 2;

  const xCandidates: SnapCandidate[] = [];
  const yCandidates: SnapCandidate[] = [];
  for (const neighbor of neighbors) {
    const { frame: other, bounds } = neighbor;
    const otherRight = other.x + other.width;
    const otherBottom = other.y + other.height;
    const addX = (own: number, at: number) => xCandidates.push({ delta: at - own, at, neighbor });
    const addY = (own: number, at: number) => yCandidates.push({ delta: at - own, at, neighbor });

    // A shared vertical line only means something when the two are close vertically, and vice versa.
    if (Math.max(other.y - bottom, top - otherBottom) <= reach) {
      addX(left, other.x);
      addX(right, otherRight);
      addX(left, otherRight);
      addX(right, other.x);
      addX(centerX, other.x + other.width / 2);
      addX(left, bounds.x + bounds.width + gap);
      addX(right, bounds.x - gap);
    }
    if (Math.max(other.x - right, left - otherRight) <= reach) {
      addY(top, other.y);
      addY(bottom, otherBottom);
      addY(centerY, other.y + other.height / 2);
      addY(top, bounds.y + bounds.height + gap + labelHeight);
      addY(bottom, bounds.y - gap);
    }
  }

  const snapX = closest(xCandidates, threshold);
  const snapY = closest(yCandidates, threshold);
  const dx = snapX?.delta ?? 0;
  const dy = snapY?.delta ?? 0;

  const guides: SnapGuide[] = [];
  if (snapX) {
    const { frame: other } = snapX.neighbor;
    guides.push({
      axis: "x",
      at: snapX.at,
      start: Math.min(top + dy, other.y),
      end: Math.max(bottom + dy, other.y + other.height),
    });
  }
  if (snapY) {
    const { frame: other } = snapY.neighbor;
    guides.push({
      axis: "y",
      at: snapY.at,
      start: Math.min(left + dx, other.x),
      end: Math.max(right + dx, other.x + other.width),
    });
  }
  return { dx, dy, guides };
}

export type LandingInput = {
  /** Where the pointer is carrying the item, as the frame's top-left corner. */
  desired: Point;
  /** The item's frame and full bounds, label included, at any one position. */
  frame: Rect;
  bounds: Rect;
  neighbors: readonly SnapNeighbor[];
  gap: number;
  threshold: number;
  snap: boolean;
  reach?: number;
};

/**
 * Where an item ends up if dropped now. Clearing its neighbors always wins, and lining up with them
 * only applies if it stays clear.
 */
export function landingFor(input: LandingInput): Point & { guides: SnapGuide[] } {
  const { desired, frame, bounds, neighbors, gap, threshold, snap, reach } = input;
  const offset = { x: bounds.x - frame.x, y: bounds.y - frame.y };
  const obstacles = neighbors.map((neighbor) => neighbor.bounds);
  const free = nearestFreeSpot(
    { ...bounds, x: desired.x + offset.x, y: desired.y + offset.y },
    obstacles,
    gap,
  );
  const x = free.x - offset.x;
  const y = free.y - offset.y;
  if (!snap) return { x, y, guides: [] };

  const pull = snapToNeighbors({ ...frame, x, y }, neighbors, {
    threshold,
    gap,
    labelHeight: -offset.y,
    reach,
  });
  const isClear = (dx: number, dy: number) => {
    const rect = { ...bounds, x: x + dx + offset.x, y: y + dy + offset.y };
    const spot = nearestFreeSpot(rect, obstacles, gap);
    return spot.x === rect.x && spot.y === rect.y;
  };
  // If both together would collide, one axis on its own may still line up.
  const usable = [
    { dx: pull.dx, dy: pull.dy },
    { dx: pull.dx, dy: 0 },
    { dx: 0, dy: pull.dy },
  ].find((option) => isClear(option.dx, option.dy));
  if (!usable) return { x, y, guides: [] };
  return {
    x: x + usable.dx,
    y: y + usable.dy,
    guides: pull.guides.filter((guide) =>
      guide.axis === "x" ? usable.dx === pull.dx : usable.dy === pull.dy,
    ),
  };
}

/** Pulls the carried item onto its landing spot per axis once it's within range. */
export function magnetize(desired: Point, landing: Point, range: number): Point {
  return {
    x: Math.abs(desired.x - landing.x) <= range ? landing.x : desired.x,
    y: Math.abs(desired.y - landing.y) <= range ? landing.y : desired.y,
  };
}
