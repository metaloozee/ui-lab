import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { motion, useReducedMotionConfig } from "motion/react";

import {
  mergeFluidHoverHandlers,
  SelfFluidHoverLayer,
  useSelfFluidHover,
} from "@/components/self-fluid-hover";
import { fontWeights } from "@/lib/font-weight";
import { type IconName, useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
import { nestedRadius, useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

/** One tile of the grid, in px: a square and the gap that follows it. */
const CELL = 6;
const TILE = 5;
/** The bevel's inner edge, where the mosaic's clip follows the button's corners. */
const BEVEL = 2;

// The field's timing is the subject of this experiment, so it keeps its own clock rather than the spring tiers.
/** A still pointer lights the grid this wide and this bright. A fast one reaches the max of both. */
const BASE_RADIUS = 26;
const MAX_RADIUS = 72;
const BASE_STRENGTH = 0.6;
/** Pointer speed, in px per ms, that carries about two thirds of the full weight. */
const SPEED_SCALE = 1.1;
const WEIGHT_RISE_MS = 40;
const WEIGHT_FALL_MS = 320;
/** Tiles light almost at once and dim more slowly, so the pointer leaves a short wake. */
const CELL_ATTACK_MS = 30;
const CELL_RELEASE_MS = 260;
/** A press sends one ring of light outward at this speed, this thick, fading over its life. */
const RIPPLE_SPEED = 0.32;
const RIPPLE_WIDTH = 16;
const RIPPLE_LIFE_MS = 800;
/** Under reduced motion the ring stays put: one soft disc that fades where it was pressed. */
const PULSE_RADIUS = 40;
const PULSE_LIFE_MS = 360;
const SETTLED = 0.002;
/** While loading, a band of light this wide crosses the mosaic once per period. */
const SWEEP_MS = 1300;
const SWEEP_BAND = 34;
const SWEEP_STRENGTH = 0.75;
/** Under reduced motion the sweep holds still as an even glow across the mosaic. */
const BUSY_GLOW = 0.3;

/** Tile opacity at rest ranges up to this, and lit tiles reach the max. */
const REST_ALPHA = 0.4;
const LIT_ALPHA = 0.9;
/** The share of tiles that move away from the label's color, and so stay full strength behind it. */
const SAFE_SHARE = 0.5;
/**
 * Glinting tiles behind the label keep this share of their light, ramping back to full over a long
 * run beside the label and a short one above and below it, where the button's edge is close. A short
 * run beside it reads as a wall where the light stops.
 */
const LABEL_DIM = 0.12;
const LABEL_FEATHER_X = 30;
const LABEL_FEATHER_Y = 8;

/** Where the loading band's center sits at `now`, entering past the left edge and leaving past the right. */
export function sweepCenter(now: number, width: number): number {
  const progress = (((now % SWEEP_MS) + SWEEP_MS) % SWEEP_MS) / SWEEP_MS;
  return -SWEEP_BAND + progress * (width + 2 * SWEEP_BAND);
}

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

/** How much a pointer of `weight` lights a tile `distance` px away, from 0 to 1. */
export function pointerLight(distance: number, weight: number): number {
  const radius = BASE_RADIUS + (MAX_RADIUS - BASE_RADIUS) * weight;
  const strength = BASE_STRENGTH + (1 - BASE_STRENGTH) * weight;
  return strength * falloff(distance / radius);
}

/** How much a press `age` ms old lights a tile `distance` px from where it landed. */
export function rippleLight(distance: number, age: number, reduced: boolean): number {
  if (reduced) {
    if (age >= PULSE_LIFE_MS) return 0;
    return (1 - age / PULSE_LIFE_MS) * falloff(distance / PULSE_RADIUS);
  }
  if (age >= RIPPLE_LIFE_MS) return 0;
  const fade = 1 - age / RIPPLE_LIFE_MS;
  return fade * falloff(Math.abs(distance - age * RIPPLE_SPEED) / RIPPLE_WIDTH);
}

/** The share of light a tile keeps `dx` and `dy` px beyond the label's box, so the label never loses contrast. */
export function labelShade(dx: number, dy: number): number {
  const t = Math.min(1, Math.hypot(dx / LABEL_FEATHER_X, dy / LABEL_FEATHER_Y));
  return LABEL_DIM + (1 - LABEL_DIM) * t * t * (3 - 2 * t);
}

/** A stable random value in [0, 1) for a tile, so the mosaic is the same on every frame. */
export function tileNoise(col: number, row: number, seed: number): number {
  const value = Math.sin(col * 127.1 + row * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

const approach = (from: number, to: number, dt: number, tau: number) =>
  to + (from - to) * Math.exp(-dt / tau);

type Ripple = { x: number; y: number; born: number };

/**
 * A mosaic of tiles inside the button that lights under the pointer and rings out from a press.
 * All state lives in refs and one canvas, and frames run only while something is settling.
 */
function useTileField(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  labelRef: RefObject<HTMLElement | null>,
  busy: boolean,
) {
  const reduced = useReducedMotionConfig() === true;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const field = useRef({
    cols: 0,
    rows: 0,
    originX: 0,
    originY: 0,
    /** Current light per tile, and each tile's fixed rest light, gain, shade behind the label, and ink. */
    cells: new Float32Array(0),
    rest: new Float32Array(0),
    gain: new Float32Array(0),
    shade: new Float32Array(0),
    /** 1 where a tile wears the label-safe ink, 0 where it glints. */
    safe: new Uint8Array(0),
    pointer: null as { x: number; y: number; t: number } | null,
    weight: 0,
    targetWeight: 0,
    ripples: [] as Ripple[],
    frame: 0,
    last: 0,
    safeInk: "",
    glintInk: "",
    clipRadius: 0,
    resolution: 0,
  });
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const state = field.current;

    /** Backing pixels per CSS px, counting the camera's zoom in half steps. */
    const resolutionNow = () => {
      const width = canvas.offsetWidth;
      const zoom = width > 0 ? canvas.getBoundingClientRect().width / width : 1;
      const stepped = Math.ceil(Math.min(3, Math.max(1, zoom)) * 2) / 2;
      return (window.devicePixelRatio || 1) * stepped;
    };

    // Both inks resolve through the canvas's own colors, so relative OKLCH and the theme apply.
    const readInks = () => {
      const style = getComputedStyle(canvas);
      state.safeInk = style.color;
      state.glintInk = style.borderTopColor;
    };

    const layout = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      // Enough tiles to run past every edge, centered, so the bevel's clip cuts the mosaic evenly
      // on all four sides and it reads as continuing under the rim.
      const gap = CELL - TILE;
      const cols = Math.ceil(width / CELL) + 1;
      const rows = Math.ceil(height / CELL) + 1;
      state.cols = cols;
      state.rows = rows;
      state.originX = (width - (cols * CELL - gap)) / 2;
      state.originY = (height - (rows * CELL - gap)) / 2;
      state.cells = new Float32Array(cols * rows);
      state.rest = new Float32Array(cols * rows);
      state.gain = new Float32Array(cols * rows);
      state.shade = new Float32Array(cols * rows);
      state.safe = new Uint8Array(cols * rows);
      const radius = parseFloat(
        getComputedStyle(canvas.parentElement ?? canvas).borderTopLeftRadius,
      );
      state.clipRadius = Math.max(0, Math.min(radius || 0, height / 2) - BEVEL);

      // The label's box in the canvas's px. offset* ignores the press scale and the camera zoom.
      const label = labelRef.current;
      const box = label
        ? {
            left: label.offsetLeft,
            top: label.offsetTop,
            right: label.offsetLeft + label.offsetWidth,
            bottom: label.offsetTop + label.offsetHeight,
          }
        : null;

      for (let row = 0; row < rows; row++) {
        const cy = state.originY + row * CELL + CELL / 2;
        for (let col = 0; col < cols; col++) {
          const cx = state.originX + col * CELL + CELL / 2;
          const index = row * cols + col;
          // Most tiles rest near clear and some catch the light, like a sparse mosaic.
          const noise = tileNoise(col, row, 1);
          state.rest[index] = noise > 0.3 ? ((noise - 0.3) / 0.7) ** 1.5 : 0;
          state.gain[index] = 0.35 + 0.65 * tileNoise(col, row, 2);
          // Half the tiles move away from the label's color, so they only add contrast and carry the
          // mosaic straight through the label. The other half glint toward it, and give way there.
          const safe = tileNoise(col, row, 3) < SAFE_SHARE;
          state.safe[index] = safe ? 1 : 0;
          if (box && !safe) {
            const dx = Math.max(box.left - cx, 0, cx - box.right);
            const dy = Math.max(box.top - cy, 0, cy - box.bottom);
            state.shade[index] = labelShade(dx, dy);
          } else state.shade[index] = 1;
        }
      }

      const resolution = resolutionNow();
      const backingW = Math.round(width * resolution);
      const backingH = Math.round(height * resolution);
      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
      }
      state.resolution = resolution;
      readInks();
    };

    const draw = () => {
      const { cols, rows, cells, rest, shade, safe, originX, originY, resolution } = state;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      // Corner tiles stop at the bevel's inner edge, which follows the button's corners.
      ctx.beginPath();
      ctx.roundRect(BEVEL, BEVEL, width - 2 * BEVEL, height - 2 * BEVEL, state.clipRadius);
      ctx.clip();
      // One pass per ink, so the fill style changes twice per frame rather than per tile.
      for (const ink of [1, 0]) {
        ctx.fillStyle = ink ? state.safeInk : state.glintInk;
        for (let row = 0; row < rows; row++) {
          const y = originY + row * CELL;
          for (let col = 0; col < cols; col++) {
            const index = row * cols + col;
            if (safe[index] !== ink) continue;
            const light = (rest[index] ?? 0) * REST_ALPHA + (cells[index] ?? 0) * LIT_ALPHA;
            const alpha = Math.min(1, light) * (shade[index] ?? 1);
            if (alpha < 0.01) continue;
            ctx.globalAlpha = alpha;
            ctx.fillRect(originX + col * CELL, y, TILE, TILE);
          }
        }
      }
      ctx.restore();
    };

    const step = (now: number) => {
      state.frame = 0;
      const dt = Math.min(64, now - (state.last || now));
      state.last = now;
      const instant = reducedRef.current;

      if (!state.pointer || now - state.pointer.t > 50) state.targetWeight = 0;
      const rising = state.targetWeight > state.weight;
      state.weight = approach(
        state.weight,
        state.targetWeight,
        dt,
        rising ? WEIGHT_RISE_MS : WEIGHT_FALL_MS,
      );
      state.ripples = state.ripples.filter(
        (ripple) => now - ripple.born < (instant ? PULSE_LIFE_MS : RIPPLE_LIFE_MS),
      );

      const { cols, rows, cells, gain, originX, originY, pointer, weight, ripples } = state;
      const busy = busyRef.current;
      const sweep = busy && !instant ? sweepCenter(now, canvas.offsetWidth) : 0;
      // The sweep keeps frames coming for as long as it loads.
      let moving =
        busy || ripples.length > 0 || Math.abs(state.weight - state.targetWeight) > SETTLED;
      for (let row = 0; row < rows; row++) {
        const cy = originY + row * CELL + CELL / 2;
        for (let col = 0; col < cols; col++) {
          const cx = originX + col * CELL + CELL / 2;
          let target = 0;
          if (busy) {
            target += instant
              ? BUSY_GLOW
              : SWEEP_STRENGTH * falloff(Math.abs(cx - sweep) / SWEEP_BAND);
          }
          if (pointer) target += pointerLight(Math.hypot(cx - pointer.x, cy - pointer.y), weight);
          for (const ripple of ripples) {
            target += rippleLight(
              Math.hypot(cx - ripple.x, cy - ripple.y),
              now - ripple.born,
              instant,
            );
          }
          const index = row * cols + col;
          // Each tile takes its own share of the light, so the glow reads as a mosaic, not a blob.
          target = Math.min(1, target) * (gain[index] ?? 1);
          const current = cells[index] ?? 0;
          const tau = target > current || instant ? CELL_ATTACK_MS : CELL_RELEASE_MS;
          const next = approach(current, target, dt, tau);
          cells[index] = Math.abs(next - target) < SETTLED ? target : next;
          if (cells[index] !== target) moving = true;
        }
      }

      draw();
      if (moving || pointer) state.frame = requestAnimationFrame(step);
      else state.last = 0;
    };

    kick.current = () => {
      if (!state.frame) state.frame = requestAnimationFrame(step);
    };
    const relayout = () => {
      layout();
      draw();
    };

    relayout();
    // The label's box moves once its font arrives.
    void document.fonts.ready.then(relayout);

    const resize = new ResizeObserver(relayout);
    resize.observe(canvas);
    if (labelRef.current) resize.observe(labelRef.current);

    // Theme and accent live on the root element, so the ink follows them there.
    const theme = new MutationObserver(() => {
      readInks();
      draw();
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent", "style"],
    });

    // The camera zooms by restyling an ancestor's transform, so tiles stay crisp at rest.
    let zoomFrame = 0;
    const zoom = new MutationObserver(() => {
      if (zoomFrame) return;
      zoomFrame = requestAnimationFrame(() => {
        zoomFrame = 0;
        if (resolutionNow() !== state.resolution) relayout();
      });
    });
    for (let node = canvas.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).transform !== "none") {
        zoom.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
      }
    }

    return () => {
      resize.disconnect();
      theme.disconnect();
      zoom.disconnect();
      cancelAnimationFrame(zoomFrame);
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    };
  }, [canvasRef, labelRef]);

  /** The pointer in the button's own px, undoing the camera's zoom. */
  const localPoint = (event: PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const scale = target.offsetWidth > 0 ? rect.width / target.offsetWidth : 1;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  // Starting or ending a load wakes the field, so the sweep begins and the tiles settle after it.
  useEffect(() => kick.current(), [busy]);

  /** A ring of light from the middle, for a change no pointer started, such as a load finishing. */
  const ring = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    field.current.ripples.push({
      x: canvas.offsetWidth / 2,
      y: canvas.offsetHeight / 2,
      born: performance.now(),
    });
    kick.current();
  }, [canvasRef]);

  const handlers = {
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const state = field.current;
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
    },
    onPointerLeave(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === "touch" && event.buttons) return;
      field.current.pointer = null;
      kick.current();
    },
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const state = field.current;
      const point = localPoint(event);
      state.ripples.push({ ...point, born: performance.now() });
      if (event.pointerType === "touch") state.pointer = { ...point, t: event.timeStamp };
      kick.current();
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== "touch") return;
      field.current.pointer = null;
      kick.current();
    },
    /** A key press rings out from the middle, since there's no pointer to start from. */
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      const target = event.currentTarget;
      field.current.ripples.push({
        x: target.offsetWidth / 2,
        y: target.offsetHeight / 2,
        born: performance.now(),
      });
      kick.current();
    },
  };

  return { handlers, ring };
}

/* oxlint-disable ui-lab/design-tokens -- The button's material is the subject. Every shade is derived from the tone's base color with relative OKLCH, so it follows the toolbar's accent and the theme. */
const MATERIAL = {
  // Lit from above: deeper and richer toward the bottom. Each tone sets the ramp per theme, so a
  // light label never sits on a fill lighter than its base's own measured pair.
  "--gb-top": "oklch(from var(--gb-base) calc(l + var(--gb-top-l)) calc(c * 0.94) h)",
  "--gb-bottom": "oklch(from var(--gb-base) calc(l + var(--gb-bottom-l)) calc(c * 1.06) h)",
  // The outer edge, a step darker than the body, like the lip of a molded cap.
  "--gb-rim": "oklch(from var(--gb-base) calc(l - 0.12) c h)",
  // The light catching the cap's inner bevel.
  "--gb-gleam": "oklch(from var(--gb-base) calc(l + 0.22) calc(c * 0.75) h)",
  // The mosaic's two inks, a step either side of the body, by steps each tone sets.
  "--gb-shine": "oklch(from var(--gb-base) calc(l + var(--gb-shine-l)) calc(c * 0.75) h)",
  "--gb-deep": "oklch(from var(--gb-base) calc(l - var(--gb-deep-l)) calc(c * 1.05) h)",
  // Pressed, the top falls into shadow as the cap sinks.
  "--gb-sink": "oklch(from var(--gb-base) calc(l - 0.18) c h / 0.22)",
  // A colored cap casts its own color, so it glows onto the page rather than greying it.
  "--gb-lift":
    "0 1px 1px -0.5px oklch(from var(--gb-shadow) calc(l - 0.2) c h / 0.35), 0 3px 8px -2px oklch(from var(--gb-shadow) l c h / 0.45)",
  "--gb-lift-pressed":
    "0 0.5px 0.5px 0 oklch(from var(--gb-shadow) calc(l - 0.2) c h / 0.35), 0 1px 3px -1px oklch(from var(--gb-shadow) l c h / 0.35)",
} as CSSProperties;

export type GridTone = "primary" | "secondary" | "destructive";

/**
 * Each tone's base, label, and hover wash, and per theme its ramp and which tile ink is safe behind
 * the label: the one that moves away from the label's color. The other glints toward it and gives way.
 */
const TONES: Record<GridTone, { surface: string; hover: string }> = {
  primary: {
    surface:
      "text-text-on-accent [--gb-deep-l:0.12] [--gb-shine-l:0.22] [--gb-base:var(--color-accent-solid)] [--gb-shadow:var(--color-accent-solid)] [--gb-top-l:0] [--gb-bottom-l:-0.06] [--gb-safe:var(--gb-deep)] [--gb-glint:var(--gb-shine)] dark:[--gb-top-l:0.05] dark:[--gb-bottom-l:-0.01] dark:[--gb-safe:var(--gb-shine)] dark:[--gb-glint:var(--gb-deep)]",
    hover: "bg-[color-mix(in_oklab,var(--color-accent-solid-hover)_40%,transparent)]",
  },
  destructive: {
    surface:
      "text-danger-on-solid [--gb-deep-l:0.12] [--gb-shine-l:0.22] [--gb-base:var(--color-danger-solid)] [--gb-shadow:var(--color-danger-solid)] [--gb-top-l:0] [--gb-bottom-l:-0.06] [--gb-safe:var(--gb-deep)] [--gb-glint:var(--gb-shine)] dark:[--gb-top-l:0.05] dark:[--gb-bottom-l:-0.01] dark:[--gb-safe:var(--gb-shine)] dark:[--gb-glint:var(--gb-deep)]",
    hover: "bg-[color-mix(in_oklab,var(--color-danger-solid-hover)_40%,transparent)]",
  },
  // A neutral cap: white in light, a raised grey in dark, casting a plain shadow. Its label is dark
  // in light and light in dark, so the safe ink swaps the other way round.
  secondary: {
    surface:
      "text-text-primary [--gb-deep-l:0.12] [--gb-shine-l:0.22] [--gb-base:var(--color-bg-raised)] [--gb-shadow:oklch(0.35_0_0)] [--gb-top-l:0] [--gb-bottom-l:-0.045] [--gb-safe:var(--gb-shine)] [--gb-glint:var(--gb-deep)] dark:[--gb-shadow:oklch(0.08_0_0)] dark:[--gb-top-l:0.02] dark:[--gb-bottom-l:-0.04] dark:[--gb-safe:var(--gb-deep)] dark:[--gb-glint:var(--gb-shine)]",
    // The system's hover fill, flat across the whole cap, greys out its gradient. A share of it
    // shades the cap instead.
    hover: "bg-[color-mix(in_oklab,var(--color-bg-hover)_40%,transparent)]",
  },
};

/** The bevel's inner ring: bright along the top, faint down the sides, a touch brighter again at the bottom lip. */
const GLEAM: CSSProperties = {
  border: "1px solid transparent",
  background:
    "linear-gradient(to bottom, var(--gb-gleam), color-mix(in oklab, var(--gb-gleam) 18%, transparent) 55%, color-mix(in oklab, var(--gb-gleam) 40%, transparent)) border-box",
  mask: "linear-gradient(black, black) padding-box exclude, linear-gradient(black, black) border-box",
  WebkitMask: "linear-gradient(black, black) padding-box, linear-gradient(black, black) border-box",
  WebkitMaskComposite: "xor",
};
/* oxlint-enable ui-lab/design-tokens */

/**
 * The cap every grid button shares: its layers, mosaic, hover, and press. `content` is what the
 * mosaic dims behind, and presses toward `pressScale`.
 */
function GridSurface({
  tone,
  status = "idle",
  className,
  pressScale,
  content,
  ...button
}: {
  tone: GridTone;
  status?: GridStatus;
  className: string;
  pressScale: number;
  content: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
}) {
  const shape = useShape();
  const self = useSelfFluidHover<HTMLButtonElement>();
  // Only the hover's mouse handlers: its own click handler would replace the button's.
  const hover = mergeFluidHoverHandlers(self.hover.handlers, {});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const tiles = useTileField(canvasRef, contentRef, status === "loading");
  const press = pressMotion();

  // Finishing rings out from the middle, so the result reads as coming from the button itself.
  const { ring } = tiles;
  useEffect(() => {
    if (status === "done") ring();
  }, [status, ring]);

  return (
    <motion.button
      ref={self.ref}
      type="button"
      whileTap="pressed"
      aria-busy={status === "loading" || undefined}
      {...button}
      {...hover}
      {...tiles.handlers}
      className={cn(
        "group relative isolate inline-flex cursor-pointer items-center aria-busy:cursor-progress justify-center overflow-hidden whitespace-nowrap outline-none select-none [-webkit-tap-highlight-color:transparent]",
        "[box-shadow:var(--gb-lift)] transition-[box-shadow] duration-[var(--spring-fast)] active:[box-shadow:var(--gb-lift-pressed)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-border-focus",
        "disabled:pointer-events-none disabled:opacity-50",
        TONES[tone].surface,
        shape.button,
        className,
      )}
      style={MATERIAL}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--gb-top),var(--gb-bottom))]"
      />
      <SelfFluidHoverLayer self={self} className={TONES[tone].hover} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--gb-sink),transparent_70%)] opacity-0 transition-opacity duration-[var(--spring-fast)] group-active:opacity-100"
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 block size-full border-[color:var(--gb-glint)] text-[color:var(--gb-safe)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] [box-shadow:inset_0_0_0_1px_var(--gb-rim)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-px transition-opacity duration-[var(--spring-fast)] group-active:opacity-45"
        style={{ ...GLEAM, borderRadius: nestedRadius(shape.bgRadius, 0, 1) }}
      />
      <motion.span
        ref={contentRef}
        variants={{ pressed: { scale: pressScale } }}
        transition={press.transition}
        className="relative inline-flex items-center gap-[inherit]"
        style={{ fontVariationSettings: fontWeights.semibold }}
      >
        {content}
      </motion.span>
    </motion.button>
  );
}

export type GridStatus = "idle" | "loading" | "done";

/**
 * Two faces crossing in one cell: what arrives eases in on the fast tier with a touch of blur and
 * scale, and what leaves goes first on its quicker exit. Reduced motion keeps the fade alone.
 */
function useFaceSwap() {
  const reduced = useReducedMotionConfig() === true;
  const shown = { opacity: 1, scale: 1, filter: "blur(0px)" };
  const hidden = { opacity: 0, scale: 0.6, filter: reduced ? "blur(0px)" : "blur(4px)" };
  return (visible: boolean) => ({
    initial: false as const,
    animate: visible ? shown : hidden,
    transition: visible
      ? { duration: spring.fast.duration, ease: "easeOut" as const }
      : { ...spring.fast.exit, ease: "easeIn" as const },
  });
}

// The loader's timing is part of this experiment: a quick lap, and a comet that breathes as it goes.
/** The system's infinity loop, as a closed path measured in hundredths. */
const LOOP_PATH =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
/** The loop's bounds plus half a stroke, so it fills its slot rather than floating in a square. */
const LOOP_VIEWBOX = "3.75 7.25 16.5 9.5";
const LOOP_ASPECT = 16.5 / 9.5;
/** One lap of the comet, and one breath of its length, from short to long and back. */
const LOOP_LAP_MS = 900;
const LOOP_BREATH_MS = 1800;
const COMET_SHORT = 14;
const COMET_LONG = 34;
/** The comet's layers, head first: each is longer and fainter, with every head on the same point. */
const COMET_TAIL = [
  { extra: 0, opacity: 1 },
  { extra: 7, opacity: 0.45 },
  { extra: 16, opacity: 0.2 },
] as const;
const TRACK_OPACITY = 0.16;

/** A dash `length` long, with the rest of the loop as its gap, so the pattern wraps cleanly. */
const dash = (length: number) => `${length} ${100 - length}`;

/**
 * The infinity loader: a faint track of the whole loop, and a tapered comet that laps it quickly
 * while its length breathes. It mounts ahead of time, hidden, and only runs while `spinning`, so idle
 * buttons cost nothing. Under reduced motion the comet holds still partway round the loop, which
 * still reads as loading beside the announcement.
 */
function InfinityLoader({ size, spinning }: { size: number; spinning: boolean }) {
  const still = useReducedMotionConfig() === true || !spinning;
  const width = Math.round(size * 1.25);
  const height = Math.round(width / LOOP_ASPECT);
  // The icons draw a 2-unit stroke on a 24-unit grid. Match that rendered weight in this box's units.
  const stroke = ((2 * size) / 24) * (16.5 / width);
  return (
    <svg width={width} height={height} viewBox={LOOP_VIEWBOX} fill="none" aria-hidden>
      <path d={LOOP_PATH} stroke="currentColor" strokeWidth={stroke} opacity={TRACK_OPACITY} />
      {COMET_TAIL.map(({ extra, opacity }) => (
        <motion.path
          key={extra}
          d={LOOP_PATH}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          opacity={opacity}
          // A longer dash starts `extra` further back, so its head lands on the head of the comet.
          // At rest it waits where a lap begins, so starting to spin never jumps.
          initial={{ strokeDashoffset: extra, strokeDasharray: dash(COMET_SHORT + extra) }}
          animate={
            still
              ? { strokeDashoffset: extra, strokeDasharray: dash(COMET_SHORT + extra) }
              : {
                  strokeDashoffset: [extra, extra - 100],
                  strokeDasharray: [
                    dash(COMET_SHORT + extra),
                    dash(COMET_LONG + extra),
                    dash(COMET_SHORT + extra),
                  ],
                }
          }
          transition={
            still
              ? { duration: 0 }
              : {
                  strokeDashoffset: {
                    duration: LOOP_LAP_MS / 1000,
                    ease: "linear",
                    repeat: Infinity,
                  },
                  strokeDasharray: {
                    duration: LOOP_BREATH_MS / 1000,
                    ease: "easeInOut",
                    repeat: Infinity,
                  },
                }
          }
        />
      ))}
    </svg>
  );
}

/**
 * A grid button with a label and optional icons. While `status` is loading, a spinner takes the
 * label's place and a band of light sweeps the mosaic; when it's done, a check and `doneLabel` take
 * over and a ring of light leaves the middle. Every face shares one cell, so the width never moves.
 */
export function GridButton({
  children,
  tone = "primary",
  leadingIcon,
  trailingIcon,
  disabled,
  status = "idle",
  doneLabel,
  onClick,
}: {
  children: ReactNode;
  tone?: GridTone;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  status?: GridStatus;
  doneLabel?: string;
  onClick?: () => void;
}) {
  const size = useSize();
  const icons = useIcons();
  const face = useFaceSwap();
  const compact = size.variant === "compact";
  const Leading = leadingIcon ? icons[leadingIcon] : null;
  const Trailing = trailingIcon ? icons[trailingIcon] : null;
  const Done = icons.check;

  return (
    <>
      <GridSurface
        tone={tone}
        status={status}
        disabled={disabled}
        onClick={onClick}
        pressScale={0.96}
        className={cn(
          size.control,
          size.text,
          compact ? "gap-1" : "gap-1.5",
          compact ? (Leading ? "pl-2" : "pl-3") : Leading ? "pl-3" : "pl-4",
          compact ? (Trailing ? "pr-2" : "pr-3") : Trailing ? "pr-3" : "pr-4",
        )}
        content={
          <span className="grid items-center justify-items-center gap-[inherit] [grid-template-areas:'face']">
            {/* The label stays mounted while hidden, so it keeps the button's name and width. */}
            <motion.span
              className="inline-flex items-center gap-[inherit] [grid-area:face]"
              {...face(status === "idle")}
            >
              {Leading && <Leading size={size.icon} strokeWidth={2} />}
              <span className="[text-box:trim-both_cap_alphabetic]">{children}</span>
              {Trailing && <Trailing size={size.icon} strokeWidth={2} />}
            </motion.span>
            <motion.span
              aria-hidden
              className="grid place-items-center [grid-area:face]"
              {...face(status === "loading")}
            >
              <InfinityLoader size={size.icon} spinning={status === "loading"} />
            </motion.span>
            {doneLabel && (
              <motion.span
                aria-hidden
                className="inline-flex items-center gap-[inherit] [grid-area:face]"
                {...face(status === "done")}
              >
                <Done size={size.icon} strokeWidth={2} />
                <span className="[text-box:trim-both_cap_alphabetic]">{doneLabel}</span>
              </motion.span>
            )}
          </span>
        }
      />
      <span role="status" className="sr-only">
        {status === "loading" ? "Loading" : status === "done" ? doneLabel : ""}
      </span>
    </>
  );
}

/** How long the done icon holds before turning back. */
const DONE_HOLD_MS = 1600;

/**
 * A square grid button whose icon morphs into a done icon when pressed, then back after a moment.
 * Its name stays put, and the done state reaches screen readers through a polite live region.
 */
export function GridIconButton({
  tone = "primary",
  icon,
  doneIcon,
  label,
  doneLabel,
}: {
  tone?: GridTone;
  icon: IconName;
  doneIcon: IconName;
  label: string;
  doneLabel: string;
}) {
  const size = useSize();
  const icons = useIcons();
  const face = useFaceSwap();
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = () => {
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), DONE_HOLD_MS);
  };

  const Icon = icons[icon];
  const Done = icons[doneIcon];

  return (
    <>
      <GridSurface
        tone={tone}
        aria-label={label}
        onClick={onClick}
        pressScale={0.92}
        className={cn(size.control, "aspect-square p-0")}
        content={
          // Both icons share one cell, so the slot never resizes as they cross.
          <span
            className="relative grid place-items-center"
            style={{ width: size.icon, height: size.icon }}
          >
            <motion.span className="absolute inset-0 grid place-items-center" {...face(!done)}>
              <Icon size={size.icon} strokeWidth={2} />
            </motion.span>
            <motion.span className="absolute inset-0 grid place-items-center" {...face(done)}>
              <Done size={size.icon} strokeWidth={2} />
            </motion.span>
          </span>
        }
      />
      <span role="status" className="sr-only">
        {done ? doneLabel : ""}
      </span>
    </>
  );
}

/** How long a simulated load runs. */
const LOAD_MS = 1400;

export type GridButtonSample =
  | {
      kind: "text";
      id: string;
      tone: GridTone;
      label: string;
      leadingIcon?: IconName;
      trailingIcon?: IconName;
      /** Held in one state, such as loading, to show it at rest. */
      status?: GridStatus;
      disabled?: boolean;
      /** A press runs a simulated load, then returns to rest, or first shows `doneLabel`. */
      flow?: "load" | "load-feedback";
      doneLabel?: string;
    }
  | {
      kind: "icon";
      id: string;
      tone: GridTone;
      icon: IconName;
      doneIcon: IconName;
      label: string;
      doneLabel: string;
    };

/** A text sample: held in its given state, or running its flow when pressed. */
function TextSample({ sample }: { sample: Extract<GridButtonSample, { kind: "text" }> }) {
  const [status, setStatus] = useState<GridStatus>("idle");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = () => {
    // Presses while it works or shows its result change nothing.
    if (status !== "idle") return;
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      if (sample.flow !== "load-feedback") return setStatus("idle");
      setStatus("done");
      timer.current = window.setTimeout(() => setStatus("idle"), DONE_HOLD_MS);
    }, LOAD_MS);
  };

  return (
    <GridButton
      tone={sample.tone}
      leadingIcon={sample.leadingIcon}
      trailingIcon={sample.trailingIcon}
      disabled={sample.disabled}
      status={sample.flow ? status : sample.status}
      doneLabel={sample.doneLabel}
      onClick={sample.flow ? run : undefined}
    >
      {sample.label}
    </GridButton>
  );
}

/** The samples in rows, each button at its own width. */
export function GridButtons({ rows }: { rows: readonly (readonly GridButtonSample[])[] }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-4">
      {rows.map((row) => (
        <div key={row.map((sample) => sample.id).join()} className="flex items-center gap-3">
          {row.map((sample) =>
            sample.kind === "icon" ? (
              <GridIconButton
                key={sample.id}
                tone={sample.tone}
                icon={sample.icon}
                doneIcon={sample.doneIcon}
                label={sample.label}
                doneLabel={sample.doneLabel}
              />
            ) : (
              <TextSample key={sample.id} sample={sample} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
