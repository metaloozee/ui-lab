import { type CSSProperties, useEffect, useRef } from "react";

import { motion, useReducedMotionConfig } from "motion/react";

import { SelfFluidHoverLayer, useSelfFluidHover } from "@/components/self-fluid-hover";
import { fontWeights } from "@/lib/font-weight";
import { useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
import { useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { cn } from "@/lib/utils";

/**
 * Glyphs from no ink to full ink, for the mark and the scatter around it. It leaves out the
 * outline's strokes, so a thinned mark never reads as more outline.
 */
export const RAMP = " .,;=+*#%@";

/** One cell of the mesh, in px. Wider than a Geist Mono glyph at 12px, so columns keep a gap. */
const CELL_W = 10;
const CELL_H = 14;
const FONT = `12px "Geist Mono Variable", ui-monospace, monospace`;
/** Raster samples per cell on each axis when measuring how much of a cell the mark covers. */
const SAMPLES = 4;
/** Nothing draws within this many px of a line of copy. Marks are placed clear of the copy, so this only takes out a few scattered dots. */
const COPY_CLEARANCE = 4;

/** Ink strengths at rest: the mark at full ink, the scatter around it quiet. */
const OUTLINE_ALPHA = 1;
const MARK_ALPHA = 1;
const SCATTER_ALPHA = 0.34;
/** How bright the scatter gets under a full disturbance. */
const SCATTER_DISTURBED_ALPHA = 0.6;

// The field's timing is the subject of this experiment, so it keeps its own clock rather than the spring tiers.
/** A still pointer still parts the mesh, this wide and this deep. A fast one reaches the max of both. */
const BASE_RADIUS = 56;
const MAX_RADIUS = 150;
const BASE_STRENGTH = 0.72;
/** Pointer speed, in px per ms, that carries about two thirds of the full weight. */
const SPEED_SCALE = 1.1;
/** How quickly weight builds while moving, and drains once the pointer slows or stops. */
const WEIGHT_RISE_MS = 40;
const WEIGHT_FALL_MS = 200;
/** Cells thin almost at once and fill back in more slowly, so the pointer leaves a short wake. */
const CELL_ATTACK_MS = 30;
const CELL_RELEASE_MS = 260;
/** Behind a ripple cells refill quickly, so it reads as a ring rather than a spreading hole. */
const RIPPLE_RELEASE_MS = 90;
/** A click sends one ring outward at this speed, this thick, fading over its life. */
const RIPPLE_SPEED = 0.45;
const RIPPLE_WIDTH = 24;
const RIPPLE_LIFE_MS = 1100;
/** Ripples together thin the mark at most this much, below the outline's hold, so it survives a burst of clicks. Open space takes the full ring. */
const RIPPLE_CAP = 0.55;
/** Under reduced motion the ring stays put: one soft disc that fades where it was clicked. */
const PULSE_RADIUS = 120;
const PULSE_LIFE_MS = 420;
/** The outline holds its stroke until thinning passes this. */
const OUTLINE_HOLD = 0.6;
/** A pointer counts as moving for this long after its last event. */
const POINTER_FRESH_MS = 50;
/** Below this, a cell has landed and needs no more frames. */
const SETTLED = 0.002;

/** A soft bump: 1 at the center, 0 at `t = 1`, flat at both ends so the edge never shows a ring. */
export function falloff(t: number): number {
  if (t >= 1) return 0;
  const inner = 1 - t * t;
  return inner * inner;
}

/** How heavy a pointer moving at `speed` px per ms feels, from 0 to just under 1. */
export function weightFor(speed: number): number {
  return 1 - Math.exp(-Math.max(0, speed) / SPEED_SCALE);
}

/** How much a pointer of `weight` thins a cell `distance` px away, from 0 to 1. */
export function pointerThinning(distance: number, weight: number): number {
  const radius = BASE_RADIUS + (MAX_RADIUS - BASE_RADIUS) * weight;
  const strength = BASE_STRENGTH + (1 - BASE_STRENGTH) * weight;
  return strength * falloff(distance / radius);
}

/** How much a click `age` ms old thins a cell `distance` px from where it landed. */
export function rippleThinning(distance: number, age: number, reduced: boolean): number {
  if (reduced) {
    if (age >= PULSE_LIFE_MS) return 0;
    return (1 - age / PULSE_LIFE_MS) * falloff(distance / PULSE_RADIUS);
  }
  if (age >= RIPPLE_LIFE_MS) return 0;
  const fade = 1 - age / RIPPLE_LIFE_MS;
  return fade * falloff(Math.abs(distance - age * RIPPLE_SPEED) / RIPPLE_WIDTH);
}

/** The glyph for `ink`, from 0 (none) to 1 (full). */
export function glyphFor(ink: number): string {
  const clamped = Math.min(1, Math.max(0, ink));
  return RAMP[Math.round(clamped * (RAMP.length - 1))] ?? " ";
}

/**
 * The stroke that traces an edge whose coverage rises along (`gx`, `gy`), in screen px with y down.
 * The edge runs across that slope, so a slope pointing right draws a vertical bar.
 */
export function edgeGlyph(gx: number, gy: number): string {
  // The tangent is the slope turned a quarter, measured counterclockwise from the right on screen.
  const degrees = ((Math.atan2(-gx, -gy) * 180) / Math.PI + 360) % 180;
  if (degrees < 22.5 || degrees >= 157.5) return "-";
  if (degrees < 67.5) return "/";
  if (degrees < 112.5) return "|";
  return "\\";
}

/** A cell is part of the mark once the mark covers at least half of it. */
const INSIDE = 0.5;

/**
 * Drops inside cells with at most one inside neighbor. At cell size these are the frayed ends of
 * thin bands, and traced alone they read as stray marks rather than the logo.
 */
export function pruneSpecks(coverage: Float32Array, cols: number, rows: number): void {
  const inside = (col: number, row: number) =>
    col >= 0 && col < cols && row >= 0 && row < rows && (coverage[row * cols + col] ?? 0) >= INSIDE;
  const specks: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!inside(col, row)) continue;
      let neighbors = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dc || dr) && inside(col + dc, row + dr)) neighbors++;
        }
      }
      // A cell at the grid's edge may continue past it, so only interior cells can be specks.
      const interior = col > 0 && row > 0 && col < cols - 1 && row < rows - 1;
      if (interior && neighbors <= 1) specks.push(row * cols + col);
    }
  }
  for (const index of specks) coverage[index] = 0;
}

/**
 * The stroke for a cell the mark crosses only one cell wide, such as a tip or a thin band, read
 * from which of its eight neighbors are inside. A band runs toward its inside neighbors; a cell
 * with nothing above is a tip.
 */
export function sliverGlyph(inside: (dc: number, dr: number) => boolean): string {
  const above = inside(-1, -1) || inside(0, -1) || inside(1, -1);
  const below = inside(-1, 1) || inside(0, 1) || inside(1, 1);
  if (!above && below && !inside(-1, 0) && !inside(1, 0)) return "^";
  if (above && !below && !inside(-1, 0) && !inside(1, 0)) return "v";
  const falling = inside(-1, -1) || inside(1, 1);
  const rising = inside(1, -1) || inside(-1, 1);
  if (falling && !rising) return "\\";
  if (rising && !falling) return "/";
  if (inside(0, -1) || inside(0, 1)) return "|";
  if (inside(-1, 0) || inside(1, 0)) return "-";
  return ".";
}

/**
 * The outline, one cell thick: the inside cell at each crossing, in a stroke along the edge.
 * Steep edges cross rows, so they look left and right; shallow edges look up and down. A cell
 * that is the mark's only cell across its row takes a point, so a tip stays a tip.
 */
export function traceOutline(coverage: Float32Array, cols: number, rows: number): string[] {
  const clampCol = (col: number) => Math.min(cols - 1, Math.max(0, col));
  const clampRow = (row: number) => Math.min(rows - 1, Math.max(0, row));
  const cell = (col: number, row: number) => coverage[clampRow(row) * cols + clampCol(col)] ?? 0;
  // Past the grid counts as more of the same, so a mark running off the card has no outline there.
  const inside = (col: number, row: number) => cell(col, row) >= INSIDE;
  /** A difference across `a - 1` to `a + 1`, one-sided where one of them falls off the grid. */
  const across = (a: number, last: number, read: (at: number) => number) => {
    const lo = Math.max(0, a - 1);
    const hi = Math.min(last, a + 1);
    return hi === lo ? 0 : ((read(hi) - read(lo)) * 2) / (hi - lo);
  };
  /** Sobel's 1, 2, 1 weights across the other axis, using only the rows or columns on the grid. */
  const smoothed = (a: number, last: number, read: (at: number) => number) => {
    let sum = 0;
    let weight = 0;
    for (const [offset, w] of [
      [-1, 1],
      [0, 2],
      [1, 1],
    ] as const) {
      const b = a + offset;
      if (b < 0 || b > last) continue;
      sum += w * read(b);
      weight += w;
    }
    return (sum / weight) * 4;
  };
  const strokes = Array.from({ length: cols * rows }, () => "");
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!inside(col, row)) continue;
      const left = !inside(col - 1, row);
      const right = !inside(col + 1, row);
      const up = !inside(col, row - 1);
      const down = !inside(col, row + 1);
      const index = row * cols + col;
      if ((left && right) || (up && down)) {
        strokes[index] = sliverGlyph(
          (dc, dr) => (dc === 0 && dr === 0) || inside(col + dc, row + dr),
        );
        continue;
      }
      // A corner with nothing above (or below) leans toward its open side, so a tip that falls
      // between two cells reads as a point rather than a flat cap.
      const above = inside(col - 1, row - 1) || inside(col, row - 1) || inside(col + 1, row - 1);
      const below = inside(col - 1, row + 1) || inside(col, row + 1) || inside(col + 1, row + 1);
      if (left !== right && !above) {
        strokes[index] = left ? "/" : "\\";
        continue;
      }
      if (left !== right && !below) {
        strokes[index] = left ? "\\" : "/";
        continue;
      }
      // Sobel across neighbors, in px, so the cell's 10 by 14 shape doesn't skew the angle.
      const gx = smoothed(row, rows - 1, (r) => across(col, cols - 1, (c) => cell(c, r))) / CELL_W;
      const gy = smoothed(col, cols - 1, (c) => across(row, rows - 1, (r) => cell(c, r))) / CELL_H;
      const steep = Math.abs(gx) >= Math.abs(gy);
      if (steep ? left || right : up || down) strokes[index] = edgeGlyph(gx, gy);
    }
  }
  return strokes;
}

/** Where a thinned cell lands. The mark empties toward nothing; open space lifts to faint dots, so the hand shows there too. */
export function disturbedInk(base: number, thinning: number): number {
  return base >= INSIDE ? base * (1 - thinning) : base + (0.36 - base) * thinning;
}

/** What a cell is, which sets how it draws. */
const Kind = {
  /** Open field: a sparse scatter that lifts under the hand. */
  Field: 0,
  Mark: 1,
  /** Open space inside the mark's bounds, such as the octocat. Empty at rest so the figure reads; the hand still lifts it. */
  Hollow: 2,
  /** Under the copy. Never draws, so no glyph ever sits on the words. */
  Copy: 3,
} as const;

/** A fixed scatter in [0, 1) per cell, so the field's texture never shimmers between frames. */
const scatter = (col: number, row: number) => {
  const value = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Eases `from` toward `to` over `tau` ms, the same however the frames fall. */
const approach = (from: number, to: number, dt: number, tau: number) =>
  to + (from - to) * Math.exp(-dt / tau);

type Ripple = { x: number; y: number; born: number };

/** Where a brand's mark sits in its card: its center as fractions of the card, its size as a fraction of the card's height. */
export type MarkPlacement = { x: number; y: number; size: number };

/**
 * An ASCII field that draws a mark: dense inside, traced along its outline, a sparse scatter
 * around it, and never under the copy (any descendant of the card marked `data-field-clear`). It parts
 * under the pointer. All state lives in refs and one canvas, so a move costs a frame of drawing and
 * never a React render. Frames run only while something is settling.
 */
function MarkField({
  path,
  placement,
  traced,
  grain,
}: {
  path: string;
  placement: MarkPlacement;
  /** Whether the outline is drawn in strokes. A mark made of bands thinner than two cells reads as hatching when traced, so it stays solid. */
  traced: boolean;
  /** Whether the fill mixes glyphs. A flat logo, such as a plain triangle, reads as itself only when solid. */
  grain: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedConfig = useReducedMotionConfig();
  const reduced = reducedConfig === true;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const field = useRef({
    cols: 0,
    rows: 0,
    originX: 0,
    originY: 0,
    /** Resting ink per cell, row by row. */
    base: new Float32Array(0),
    kinds: new Uint8Array(0),
    /** The outline stroke per cell, or "" off the outline. */
    strokes: [] as string[],
    /** Current thinning per cell. */
    cells: new Float32Array(0),
    pointer: null as { x: number; y: number; t: number } | null,
    weight: 0,
    targetWeight: 0,
    ripples: [] as Ripple[],
    frame: 0,
    last: 0,
    ink: "",
    resolution: 0,
  });

  const kick = useRef<() => void>(() => {});
  const relayout = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const card = canvas?.parentElement;
    if (!canvas || !ctx || !card) return;
    const state = field.current;
    const mark = new Path2D(path);
    const raster = document.createElement("canvas");
    const rasterCtx = raster.getContext("2d", { willReadFrequently: true });

    /** The camera's zoom on this canvas, so DOM rects can be read in the canvas's own px. */
    const zoomNow = () => {
      const width = canvas.offsetWidth;
      return width > 0 ? canvas.getBoundingClientRect().width / width : 1;
    };

    /** Backing pixels per CSS px. The canvas draws at the zoomed size, in half steps so a zoom gesture reallocates rarely. */
    const resolutionNow = () => {
      const stepped = Math.ceil(Math.min(3, Math.max(1, zoomNow())) * 2) / 2;
      return (window.devicePixelRatio || 1) * stepped;
    };

    /** Each line of copy as a padded rect in the canvas's px. */
    const copyRects = () => {
      const origin = canvas.getBoundingClientRect();
      const zoom = zoomNow();
      const rects: { left: number; top: number; right: number; bottom: number }[] = [];
      for (const element of card.querySelectorAll("[data-field-clear]")) {
        for (const line of element.getClientRects()) {
          rects.push({
            left: (line.left - origin.left) / zoom - COPY_CLEARANCE,
            top: (line.top - origin.top) / zoom - COPY_CLEARANCE,
            right: (line.right - origin.left) / zoom + COPY_CLEARANCE,
            bottom: (line.bottom - origin.top) / zoom + COPY_CLEARANCE,
          });
        }
      }
      return rects;
    };

    /** Rasterizes the mark at a few samples per cell, then sorts every cell and traces the outline. */
    const bake = (width: number, height: number) => {
      const { cols, rows, originX, originY } = state;
      const coverage = new Float32Array(cols * rows);
      const size = placement.size * height;
      const centerX = placement.x * width;
      const centerY = placement.y * height;
      if (rasterCtx) {
        raster.width = cols * SAMPLES;
        raster.height = rows * SAMPLES;
        const scale = size / 24;
        const sx = SAMPLES / CELL_W;
        const sy = SAMPLES / CELL_H;
        rasterCtx.setTransform(1, 0, 0, 1, 0, 0);
        rasterCtx.clearRect(0, 0, raster.width, raster.height);
        rasterCtx.setTransform(
          sx * scale,
          0,
          0,
          sy * scale,
          sx * (centerX - size / 2 - originX),
          sy * (centerY - size / 2 - originY),
        );
        rasterCtx.fill(mark);
        const pixels = rasterCtx.getImageData(0, 0, raster.width, raster.height).data;
        const rowStride = raster.width * 4;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            let sum = 0;
            for (let y = 0; y < SAMPLES; y++) {
              const offset = (row * SAMPLES + y) * rowStride + col * SAMPLES * 4 + 3;
              for (let x = 0; x < SAMPLES; x++) sum += pixels[offset + x * 4] ?? 0;
            }
            coverage[row * cols + col] = sum / (255 * SAMPLES * SAMPLES);
          }
        }
      }

      const copy = copyRects();
      state.base = new Float32Array(cols * rows);
      state.kinds = new Uint8Array(cols * rows);
      pruneSpecks(coverage, cols, rows);
      state.strokes = traced
        ? traceOutline(coverage, cols, rows)
        : Array.from({ length: cols * rows }, () => "");
      for (let row = 0; row < rows; row++) {
        const y = originY + row * CELL_H + CELL_H / 2;
        for (let col = 0; col < cols; col++) {
          const x = originX + col * CELL_W + CELL_W / 2;
          const index = row * cols + col;
          const noise = scatter(col, row);
          let kind: number = Kind.Field;
          // The mark always draws, even under the copy; only the scatter steps out of the words' way.
          if ((coverage[index] ?? 0) >= INSIDE) {
            kind = Kind.Mark;
          } else if (copy.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom)) {
            kind = Kind.Copy;
          } else if (Math.hypot(x - centerX, y - centerY) < size / 2) {
            kind = Kind.Hollow;
          }
          state.kinds[index] = kind;
          // The mark: heavy glyphs, with a little grain unless it is a flat shape. The field: mostly
          // empty, a few dots and commas.
          const markInk = grain ? 0.8 + 0.2 * noise : 1;
          state.base[index] =
            kind === Kind.Mark ? markInk : kind === Kind.Field && noise > 0.62 ? 0.15 : 0;
          if (kind !== Kind.Mark) state.strokes[index] = "";
        }
      }
    };

    const layout = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      const resolution = resolutionNow();
      // Whole cells only, centered, so no glyph is ever cut by the card's edge.
      const cols = Math.max(1, Math.floor(width / CELL_W));
      const rows = Math.max(1, Math.floor(height / CELL_H));
      if (cols !== state.cols || rows !== state.rows) {
        state.cols = cols;
        state.rows = rows;
        state.cells = new Float32Array(cols * rows);
      }
      state.originX = (width - cols * CELL_W) / 2;
      state.originY = (height - rows * CELL_H) / 2;
      bake(width, height);
      const backingW = Math.round(width * resolution);
      const backingH = Math.round(height * resolution);
      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
      }
      state.resolution = resolution;
      state.ink = getComputedStyle(canvas).color;
    };

    const draw = () => {
      const { cols, rows, cells, base, kinds, strokes, originX, originY, resolution } = state;
      ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = state.ink;
      for (let row = 0; row < rows; row++) {
        const y = originY + row * CELL_H + CELL_H / 2;
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          const kind = kinds[index];
          if (kind === Kind.Copy) continue;
          const thinning = cells[index] ?? 0;
          if (kind === Kind.Hollow && thinning === 0) continue;
          const stroke = strokes[index] ?? "";
          let glyph: string;
          if (stroke && thinning < OUTLINE_HOLD) {
            glyph = stroke;
            ctx.globalAlpha = OUTLINE_ALPHA;
          } else if (kind === Kind.Mark) {
            glyph = glyphFor(disturbedInk(base[index] ?? 0, thinning));
            ctx.globalAlpha = MARK_ALPHA;
          } else {
            glyph = glyphFor(disturbedInk(base[index] ?? 0, thinning));
            ctx.globalAlpha = SCATTER_ALPHA + (SCATTER_DISTURBED_ALPHA - SCATTER_ALPHA) * thinning;
          }
          if (glyph === " ") continue;
          // A tip's caret sits high in its cell; drop it onto the row it points away from.
          const nudge = glyph === "^" ? CELL_H * 0.28 : glyph === "v" ? -CELL_H * 0.28 : 0;
          ctx.fillText(glyph, originX + col * CELL_W + CELL_W / 2, y + nudge);
        }
      }
      ctx.globalAlpha = 1;
    };

    const step = (now: number) => {
      state.frame = 0;
      const dt = Math.min(64, now - (state.last || now));
      state.last = now;
      const instant = reducedRef.current;

      // Weight drains whenever the pointer isn't feeding it.
      const fresh = state.pointer !== null && now - state.pointer.t <= POINTER_FRESH_MS;
      if (!fresh) state.targetWeight = 0;
      const rising = state.targetWeight > state.weight;
      state.weight = approach(
        state.weight,
        state.targetWeight,
        dt,
        // Reduced motion drops the lingering weight along with the wake.
        rising || instant ? WEIGHT_RISE_MS : WEIGHT_FALL_MS,
      );
      if (Math.abs(state.weight - state.targetWeight) < SETTLED) state.weight = state.targetWeight;

      state.ripples = state.ripples.filter(
        (ripple) => now - ripple.born < (instant ? PULSE_LIFE_MS : RIPPLE_LIFE_MS),
      );

      const { cols, rows, cells, kinds, originX, originY, pointer, weight, ripples } = state;
      let moving = state.ripples.length > 0 || state.weight !== state.targetWeight;
      for (let row = 0; row < rows; row++) {
        const cy = originY + row * CELL_H + CELL_H / 2;
        for (let col = 0; col < cols; col++) {
          const cx = originX + col * CELL_W + CELL_W / 2;
          const fromPointer = pointer
            ? pointerThinning(Math.hypot(cx - pointer.x, cy - pointer.y), weight)
            : 0;
          let fromRipples = 0;
          for (const ripple of ripples) {
            fromRipples += rippleThinning(
              Math.hypot(cx - ripple.x, cy - ripple.y),
              now - ripple.born,
              instant,
            );
          }
          const cap = kinds[row * cols + col] === Kind.Mark ? RIPPLE_CAP : 1;
          const target = Math.min(1, fromPointer + Math.min(cap, fromRipples));
          const index = row * cols + col;
          const current = cells[index] ?? 0;
          // Reduced motion drops the wake: cells release as fast as they part.
          const release = fromPointer >= fromRipples ? CELL_RELEASE_MS : RIPPLE_RELEASE_MS;
          const tau = target > current || instant ? CELL_ATTACK_MS : release;
          const next = approach(current, target, dt, tau);
          const landed = Math.abs(next - target) < SETTLED;
          cells[index] = landed ? target : next;
          // Compared before storing: a Float32Array never holds the double `target` exactly.
          if (!landed) moving = true;
        }
      }

      draw();
      // A resting pointer needs frames only until its weight drains and its cells land.
      if (moving || fresh) state.frame = requestAnimationFrame(step);
      else state.last = 0;
    };

    kick.current = () => {
      if (!state.frame) state.frame = requestAnimationFrame(step);
    };
    relayout.current = () => {
      layout();
      draw();
    };

    layout();
    draw();
    void document.fonts.ready.then(() => relayout.current());

    // The copy's lines decide the clear zones, so a reflow of either rebakes the field.
    const resize = new ResizeObserver(() => relayout.current());
    resize.observe(canvas);
    for (const element of card.querySelectorAll("[data-field-clear]")) resize.observe(element);

    // The camera zooms by restyling an ancestor's transform. Watching those ancestors keeps the
    // glyphs sharp at rest, rather than only once the pointer arrives.
    let zoomFrame = 0;
    const zoom = new MutationObserver(() => {
      if (zoomFrame) return;
      zoomFrame = requestAnimationFrame(() => {
        zoomFrame = 0;
        if (resolutionNow() !== state.resolution) relayout.current();
      });
    });
    for (let node: HTMLElement | null = card; node; node = node.parentElement) {
      if (getComputedStyle(node).transform !== "none") {
        zoom.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
      }
    }

    /** The pointer in the canvas's own px, undoing the camera's zoom. */
    const localPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const zoom = zoomNow();
      return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
    };

    // The card listens rather than the canvas, so the hand keeps working over the copy and link.
    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event);
      const now = event.timeStamp;
      const previous = state.pointer;
      if (previous) {
        const elapsed = Math.max(1, now - previous.t);
        const speed = Math.hypot(point.x - previous.x, point.y - previous.y) / elapsed;
        state.targetWeight = Math.max(weightFor(speed), state.targetWeight * 0.6);
      }
      state.pointer = { ...point, t: now };
      kick.current();
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch" && event.buttons) return;
      state.pointer = null;
      kick.current();
    };
    const onPointerDown = (event: PointerEvent) => {
      const point = localPoint(event);
      state.ripples.push({ ...point, born: performance.now() });
      if (event.pointerType === "touch") state.pointer = { ...point, t: event.timeStamp };
      kick.current();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      state.pointer = null;
      kick.current();
    };
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerleave", onPointerLeave);
    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", onPointerUp);

    return () => {
      card.removeEventListener("pointermove", onPointerMove);
      card.removeEventListener("pointerleave", onPointerLeave);
      card.removeEventListener("pointerdown", onPointerDown);
      card.removeEventListener("pointerup", onPointerUp);
      card.removeEventListener("pointercancel", onPointerUp);
      resize.disconnect();
      zoom.disconnect();
      cancelAnimationFrame(zoomFrame);
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    };
  }, [path, placement, traced, grain]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 block size-full text-(--story-ink) select-none"
    />
  );
}

/* oxlint-disable ui-lab/design-tokens -- Each card wears its brand's own color, the same in both themes: the brand is the subject. */
/** Marks are Simple Icons paths on a 24 unit square. `optical` sizes the small mark so the three read alike. `ink` is a muted shade of the fill, so the artwork sits under the white copy. */
const BRANDS = {
  github: {
    name: "GitHub",
    href: "https://github.com/about",
    path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
    optical: 1,
    traced: true,
    grain: true,
    fill: "oklch(0.275 0.012 254)",
    ink: "oklch(0.6 0.03 254)",
    hover: "oklch(1 0 0 / 0.14)",
  },
  vercel: {
    name: "Vercel",
    href: "https://vercel.com/about",
    path: "m12 1.608 12 20.784H0Z",
    // A solid triangle carries more ink than a ring, so it sits a touch smaller.
    optical: 0.9,
    // A flat shape: traced strokes and mixed glyphs turn it into a tree.
    traced: false,
    grain: false,
    fill: "oklch(0.13 0 0)",
    ink: "oklch(0.56 0 0)",
    hover: "oklch(1 0 0 / 0.14)",
  },
  linear: {
    name: "Linear",
    href: "https://linear.app/about",
    path: "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z",
    // Its stripes are thinner than two cells at this size, so it reads as a solid shape.
    optical: 1,
    traced: false,
    grain: true,
    fill: "oklch(0.56 0.15 277)",
    ink: "oklch(0.78 0.09 277)",
    // A mid-tone fill needs a stronger lift for the same visible step.
    hover: "oklch(1 0 0 / 0.2)",
  },
} as const;

/** Text, edges and focus on a brand fill: white at set strengths, so they hold on any brand. */
const ON_BRAND = {
  "--story-text": "oklch(1 0 0)",
  "--story-edge": "oklch(1 0 0 / 0.14)",
  // On a dark page the darkest fills sit below the canvas, so the edge carries more.
  "--story-edge-dark": "oklch(1 0 0 / 0.22)",
  "--story-focus": "oklch(1 0 0 / 0.9)",
};
/* oxlint-enable ui-lab/design-tokens */

export type BrandName = keyof typeof BRANDS;

export type StoryCard = {
  id: string;
  brand: BrandName;
  /** One sentence about the brand, set at the bottom of the card. */
  story: string;
  mark: MarkPlacement;
};

function BrandMark({ brand, size }: { brand: BrandName; size: number }) {
  const optical = Math.round(size * BRANDS[brand].optical);
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ width: size }}>
      <svg aria-hidden viewBox="0 0 24 24" width={optical} height={optical}>
        <path d={BRANDS[brand].path} fill="currentColor" />
      </svg>
    </span>
  );
}

function StoryLink({ brand }: { brand: BrandName }) {
  const self = useSelfFluidHover<HTMLAnchorElement>();
  const size = useSize();
  const { bg } = useShape();
  const icons = useIcons();
  const Arrow = icons["arrow-right"];
  return (
    <motion.a
      ref={self.ref}
      {...pressMotion(0.96)}
      {...self.hover.handlers}
      data-field-clear
      href={BRANDS[brand].href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        size.type.caption,
        bg,
        "pointer-events-auto relative -mx-2 inline-flex cursor-pointer items-center gap-1.5 self-start px-2 py-1 text-(--story-text) outline-none",
        "transition-[box-shadow] duration-[var(--spring-fast,80ms)] focus-visible:ring-2 focus-visible:ring-(--story-focus)",
      )}
    >
      <SelfFluidHoverLayer self={self} className="bg-(--story-hover)" />
      <span className="relative">Read {BRANDS[brand].name}’s story</span>
      <span className="relative">
        <Arrow size={size.variant === "compact" ? 12 : 14} />
      </span>
    </motion.a>
  );
}

function Card({
  card,
  measure,
  className,
}: {
  card: StoryCard;
  /** The story's widest line, as a class. */
  measure: string;
  className?: string;
}) {
  const { containerRadius } = useShape();
  const size = useSize();
  const brand = BRANDS[card.brand];
  const compact = size.variant === "compact";
  const style = {
    ...ON_BRAND,
    "--story-fill": brand.fill,
    "--story-ink": brand.ink,
    "--story-hover": brand.hover,
    borderRadius: containerRadius,
  } as CSSProperties;

  return (
    <article
      className={cn(
        "relative touch-none overflow-hidden bg-(--story-fill) text-(--story-text)",
        className,
      )}
      style={style}
    >
      <MarkField
        path={brand.path}
        placement={card.mark}
        traced={brand.traced}
        grain={brand.grain}
      />
      <div className="pointer-events-none relative flex h-full flex-col justify-between p-4">
        <p
          data-field-clear
          className={cn(size.type.body, "flex items-center gap-2 self-start")}
          style={{ fontVariationSettings: fontWeights.semibold }}
        >
          <BrandMark brand={card.brand} size={compact ? 12 : 14} />
          {brand.name}
        </p>
        <div className={cn("flex flex-col gap-2", measure)}>
          <h3 className={cn(size.type.title, "text-balance")}>
            <span data-field-clear>{card.story}</span>
          </h3>
          <StoryLink brand={card.brand} />
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] border border-(--story-edge) dark:border-(--story-edge-dark)"
      />
    </article>
  );
}

/** Three brand stories: one tall on the left, two stacked on the right. */
export function AsciiBento({ cards }: { cards: readonly [StoryCard, StoryCard, StoryCard] }) {
  const [tall, top, bottom] = cards;
  return (
    <div className="grid size-full grid-cols-[5fr_6fr] grid-rows-2 gap-3">
      <Card card={tall} measure="max-w-60" className="row-span-2" />
      <Card card={top} measure="max-w-48" />
      <Card card={bottom} measure="max-w-48" />
    </div>
  );
}
