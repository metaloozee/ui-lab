import { type CSSProperties, type PointerEvent, useEffect, useRef } from "react";

import { useReducedMotionConfig } from "motion/react";

import { fontWeights } from "@/lib/font-weight";
import { nestedRadius, useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { cn } from "@/lib/utils";

/** Glyphs from no ink to full ink. Resting cells wear the last one, and the pointer thins them toward the first. */
export const RAMP = " .:-=+*#%@";

/** One cell of the mesh, in px. Wider than a Geist Mono glyph at 12px, so columns keep a gap like the grid they replace. */
const CELL_W = 10;
const CELL_H = 14;
const FONT = `12px "Geist Mono Variable", ui-monospace, monospace`;
/** How far the well sits inside its card. Its corners follow from this, concentric with the card's. */
const WELL_INSET = 6;

// The field's timing is the subject of this experiment, so it keeps its own clock rather than the spring tiers.
/** A still pointer still parts the mesh, this wide and this deep. A fast one reaches the max of both. */
const BASE_RADIUS = 56;
const MAX_RADIUS = 150;
const BASE_STRENGTH = 0.72;
/** Pointer speed, in px per ms, that carries about two thirds of the full weight. */
const SPEED_SCALE = 1.1;
/** How quickly weight builds while moving, and drains once the pointer slows or stops. */
const WEIGHT_RISE_MS = 40;
const WEIGHT_FALL_MS = 320;
/** Cells thin almost at once and fill back in more slowly, so the pointer leaves a short wake. */
const CELL_ATTACK_MS = 30;
const CELL_RELEASE_MS = 260;
/** A click sends one ring outward at this speed, this thick, fading over its life. */
const RIPPLE_SPEED = 0.45;
const RIPPLE_WIDTH = 34;
const RIPPLE_LIFE_MS = 1100;
/** Under reduced motion the ring stays put: one soft disc that fades where it was clicked. */
const PULSE_RADIUS = 80;
const PULSE_LIFE_MS = 420;
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

/** The glyph for a cell thinned by `thinning`, where 0 is full ink. */
export function glyphFor(thinning: number): string {
  const ink = 1 - Math.min(1, Math.max(0, thinning));
  return RAMP[Math.round(ink * (RAMP.length - 1))] ?? " ";
}

/** Eases `from` toward `to` over `tau` ms, the same however the frames fall. */
const approach = (from: number, to: number, dt: number, tau: number) =>
  to + (from - to) * Math.exp(-dt / tau);

/** How far in from each edge the fade reaches. */
const EDGE = 20;

/** Both axes of an edge ramp, `edge` at the border and `middle` inside. Masks read only alpha, so the colors are alpha stops. */
const edgeRamp = (edge: string, middle: string) =>
  ["to right", "to bottom"]
    .map(
      (direction) =>
        `linear-gradient(${direction}, ${edge} 0, ${middle} ${EDGE}px, ${middle} calc(100% - ${EDGE}px), ${edge} 100%)`,
    )
    .join(", ");

/** Glyphs soften toward every edge but keep about a third of their ink, so the field still reads full bleed. Intersecting the two axes deepens the corners. */
const EDGE_FADE_MASK = edgeRamp("color-mix(in srgb, black 35%, transparent)", "black");
const EDGE_FADE: CSSProperties = {
  maskImage: EDGE_FADE_MASK,
  WebkitMaskImage: EDGE_FADE_MASK,
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
};

type Ripple = { x: number; y: number; born: number };

/**
 * An ASCII field that parts under the pointer. All state lives in refs and one canvas, so a move
 * costs a frame of drawing and never a React render. Frames run only while something is settling.
 */
function AsciiMesh({ radius, className }: { radius: number; className?: string }) {
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
    /** Current thinning per cell, row by row. */
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
    if (!canvas || !ctx) return;
    const state = field.current;

    /** Backing pixels per CSS px. The canvas sits under the camera's zoom, so it draws at the zoomed size, in half steps so a zoom gesture reallocates rarely. */
    const resolutionNow = () => {
      const width = canvas.offsetWidth;
      const zoom = width > 0 ? canvas.getBoundingClientRect().width / width : 1;
      const stepped = Math.ceil(Math.min(3, Math.max(1, zoom)) * 2) / 2;
      return (window.devicePixelRatio || 1) * stepped;
    };

    const layout = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      const resolution = resolutionNow();
      // Enough cells to cover the field edge to edge, centered, so the pattern bleeds evenly and the
      // well's edge clips it rather than leaving bare margins.
      const cols = Math.ceil(width / CELL_W) + 1;
      const rows = Math.ceil(height / CELL_H) + 1;
      if (cols !== state.cols || rows !== state.rows) {
        state.cols = cols;
        state.rows = rows;
        state.cells = new Float32Array(cols * rows);
      }
      state.originX = (width - cols * CELL_W) / 2;
      state.originY = (height - rows * CELL_H) / 2;
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
      const { cols, rows, cells, originX, originY, resolution } = state;
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
          const glyph = glyphFor(cells[index] ?? 0);
          if (glyph !== " ") ctx.fillText(glyph, originX + col * CELL_W + CELL_W / 2, y);
        }
      }
    };

    const step = (now: number) => {
      state.frame = 0;
      const dt = Math.min(64, now - (state.last || now));
      state.last = now;
      const instant = reducedRef.current;

      // Weight drains whenever the pointer isn't feeding it.
      if (state.pointer && now - state.pointer.t > 50) state.targetWeight = 0;
      if (!state.pointer) state.targetWeight = 0;
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

      const { cols, rows, cells, originX, originY, pointer, weight, ripples } = state;
      let moving =
        state.ripples.length > 0 || Math.abs(state.weight - state.targetWeight) > SETTLED;
      for (let row = 0; row < rows; row++) {
        const cy = originY + row * CELL_H + CELL_H / 2;
        for (let col = 0; col < cols; col++) {
          const cx = originX + col * CELL_W + CELL_W / 2;
          let target = 0;
          if (pointer)
            target += pointerThinning(Math.hypot(cx - pointer.x, cy - pointer.y), weight);
          for (const ripple of ripples) {
            target += rippleThinning(
              Math.hypot(cx - ripple.x, cy - ripple.y),
              now - ripple.born,
              instant,
            );
          }
          target = Math.min(1, target);
          const index = row * cols + col;
          const current = cells[index] ?? 0;
          // Reduced motion drops the wake: cells release as fast as they part.
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
    relayout.current = () => {
      layout();
      draw();
    };

    layout();
    draw();
    void document.fonts.load(FONT).then(() => draw());

    const resize = new ResizeObserver(() => {
      layout();
      draw();
    });
    resize.observe(canvas);

    // Theme and accent live on the root element, so the ink follows them there.
    const theme = new MutationObserver(() => {
      state.ink = getComputedStyle(canvas).color;
      draw();
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent", "style"],
    });

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
  }, []);

  /** The pointer in the canvas's own px, undoing the camera's zoom. */
  const localPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const zoom = canvas.offsetWidth > 0 ? rect.width / canvas.offsetWidth : 1;
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
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
  };

  const onPointerLeave = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch" && event.buttons) return;
    field.current.pointer = null;
    kick.current();
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const state = field.current;
    const point = localPoint(event);
    state.ripples.push({ ...point, born: performance.now() });
    if (event.pointerType === "touch") state.pointer = { ...point, t: event.timeStamp };
    kick.current();
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== "touch") return;
    field.current.pointer = null;
    kick.current();
  };

  return (
    // A recessed well: its own tint and edge, with an inner shadow so the field reads as set into the card.
    <div
      className={cn(
        "relative overflow-hidden border border-border-default",
        "bg-[color-mix(in_oklab,var(--color-accent-solid)_8%,var(--color-bg-nested))]",
        className,
      )}
      style={{ borderRadius: radius }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 block size-full cursor-none touch-none text-accent-solid select-none"
        style={EDGE_FADE}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_14px_2px_var(--color-bg-surface)]"
      />
    </div>
  );
}

export type TextureCard = {
  id: string;
  label: string;
  title: string;
  description: string;
  /** Where the mesh sits against the copy. */
  mesh: "below" | "above" | "beside";
};

function Card({ card, className }: { card: TextureCard; className?: string }) {
  const { containerRadius } = useShape();
  const size = useSize();
  const copy = (
    <div className="flex flex-col gap-1.5 p-3.5">
      <p
        className={cn(size.type.caption, "text-text-primary")}
        style={{ fontVariationSettings: fontWeights.semibold }}
      >
        {card.label}
      </p>
      <h3 className={cn(size.type.title, "text-balance text-text-primary")}>{card.title}</h3>
      <p className={cn(size.type.caption, "text-pretty text-text-secondary")}>{card.description}</p>
    </div>
  );
  const mesh = (
    <AsciiMesh
      radius={nestedRadius(containerRadius, WELL_INSET, 1)}
      className="min-h-0 min-w-0 flex-1"
    />
  );

  return (
    <article
      className={cn(
        "flex overflow-hidden border border-border-default bg-bg-surface p-1.5 shadow-surface-3",
        card.mesh === "beside" ? "flex-row" : "flex-col",
        className,
      )}
      style={{ borderRadius: containerRadius }}
    >
      {card.mesh === "above" ? (
        <>
          {mesh}
          {copy}
        </>
      ) : card.mesh === "beside" ? (
        <>
          <div className="flex w-1/2 shrink-0 flex-col justify-end">{copy}</div>
          {mesh}
        </>
      ) : (
        <>
          {copy}
          {mesh}
        </>
      )}
    </article>
  );
}

/** Three cards: one tall on the left, two stacked on the right. */
export function AsciiBento({ cards }: { cards: readonly [TextureCard, TextureCard, TextureCard] }) {
  const [tall, top, bottom] = cards;
  return (
    <div className="grid size-full grid-cols-[5fr_6fr] grid-rows-2 gap-3">
      <Card card={tall} className="row-span-2" />
      <Card card={top} />
      <Card card={bottom} />
    </div>
  );
}
