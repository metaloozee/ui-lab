import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";

import { SelfFluidHoverLayer, useSelfFluidHover } from "@/components/self-fluid-hover";
import { Button } from "@/components/ui/button";
import { useTouchPrimary } from "@/hooks/use-touch-primary";
import { fontWeights } from "@/lib/font-weight";
import { useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
import { nestedRadius, useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { getMotionTuning, spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Layout, in stage px. The stage is the preview's whole frame.
// ---------------------------------------------------------------------------

export const STAGE_W = 512;
const PAD = 16;
const COLS = 3;
const GAP = 12;
const TILE_W = (STAGE_W - PAD * 2 - GAP * (COLS - 1)) / COLS;
const PHOTO_INSET = 4;
const PHOTO_H = 108;
const CAPTION_H = 32;
const TILE_H = PHOTO_INSET + PHOTO_H + CAPTION_H;
const GRID_TOP = 56;
/** The frame ends just below the grid. The bin rises over the photos rather than taking room of its own. */
export const STAGE_H = GRID_TOP + TILE_H * 2 + GAP + PAD;
/** The trash control's square, and its inset from the photo's corner. */
const CONTROL = 28;
const CONTROL_INSET = 6;

/** Where the tile at `index` sits, by its top-left corner. */
export function slotOrigin(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: PAD + col * (TILE_W + GAP), y: GRID_TOP + row * (TILE_H + GAP) };
}

// ---------------------------------------------------------------------------
// The world the paper ball flies through: the frame's floor and walls, and an open bin.
// ---------------------------------------------------------------------------

// The throw's physics is this experiment's subject, so it keeps its own units and clock.
/** Gravity, px/s². */
const G = 2400;
/** Quadratic air drag per px. A paper ball is light for its size, so it slows noticeably. */
const DRAG = 0.00045;
/** Moment of inertia as a share of m·r². Crumpled paper sits between a hollow and a solid ball. */
const INERTIA = 0.55;
/** Coulomb friction at every contact. */
const MU = 0.5;
/** A crumpled ball is lumpy, so it stops rolling quickly once it touches something. */
const ROLL_DAMPING = 7;
const SKID_DAMPING = 4.5;
const SETTLE_SPEED = 80;
/** Impacts slower than this don't bounce, so a ball at rest stays at rest. */
const BOUNCE_FLOOR = 40;
export const SIM_DT = 1 / 240;
const MAX_FLIGHT_S = 5;
/** Slower than this for this long, and the ball counts as at rest: its last creep isn't worth waiting on. */
const REST_SPEED = 40;
const REST_S = 0.15;

export const BALL_R = 18;
export const FLOOR_Y = STAGE_H - 8;
const BIN_TOP_W = 68;
const BIN_BOTTOM_W = 52;
const BIN_H = 76;
const BIN_RIGHT = 24;
export const BIN = {
  cx: STAGE_W - BIN_RIGHT - BIN_TOP_W / 2,
  rimY: FLOOR_Y - BIN_H,
  topHalf: BIN_TOP_W / 2,
  bottomHalf: BIN_BOTTOM_W / 2,
};

type Part = "floor" | "wall" | "bin";
type Segment = { ax: number; ay: number; bx: number; by: number; e: number; part: Part };

const SEGMENTS: readonly Segment[] = [
  { ax: -2000, ay: FLOOR_Y, bx: STAGE_W + 2000, by: FLOOR_Y, e: 0.32, part: "floor" },
  { ax: 0, ay: -2000, bx: 0, by: FLOOR_Y, e: 0.4, part: "wall" },
  { ax: STAGE_W, ay: -2000, bx: STAGE_W, by: FLOOR_Y, e: 0.4, part: "wall" },
  // The bin's walls are thin, so the ball meets them from either side. Their top ends are the rim.
  {
    ax: BIN.cx - BIN.topHalf,
    ay: BIN.rimY,
    bx: BIN.cx - BIN.bottomHalf,
    by: FLOOR_Y,
    e: 0.28,
    part: "bin",
  },
  {
    ax: BIN.cx + BIN.topHalf,
    ay: BIN.rimY,
    bx: BIN.cx + BIN.bottomHalf,
    by: FLOOR_Y,
    e: 0.28,
    part: "bin",
  },
  {
    ax: BIN.cx - BIN.bottomHalf,
    ay: FLOOR_Y - 1,
    bx: BIN.cx + BIN.bottomHalf,
    by: FLOOR_Y - 1,
    e: 0.2,
    part: "bin",
  },
];

/** A ball's centre, velocity, and spin about the axis facing the viewer. Mass is 1. */
export type Body = { x: number; y: number; vx: number; vy: number; w: number };
type Hit = {
  part: Part;
  rim: boolean;
  x: number;
  y: number;
  jx: number;
  jy: number;
  speed: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * One fixed step of the ball: drag and gravity, then each contact resolved with restitution and
 * Coulomb friction, which trades sliding for spin the way a real ball does. Returns whether it
 * touched anything.
 */
export function stepBody(body: Body, dt: number, onHit?: (hit: Hit) => void): boolean {
  const speed = Math.hypot(body.vx, body.vy);
  body.vx -= DRAG * speed * body.vx * dt;
  body.vy += (G - DRAG * speed * body.vy) * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  let contact = false;
  for (const s of SEGMENTS) {
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const t = clamp01(((body.x - s.ax) * ex + (body.y - s.ay) * ey) / (ex * ex + ey * ey));
    const qx = s.ax + ex * t;
    const qy = s.ay + ey * t;
    let nx = body.x - qx;
    let ny = body.y - qy;
    const distance = Math.hypot(nx, ny);
    if (distance >= BALL_R || distance === 0) continue;
    nx /= distance;
    ny /= distance;
    contact = true;
    body.x += nx * (BALL_R - distance);
    body.y += ny * (BALL_R - distance);

    const vn = body.vx * nx + body.vy * ny;
    if (vn >= 0) continue;
    const restitution = -vn < BOUNCE_FLOOR ? 0 : s.e;
    const jn = -(1 + restitution) * vn;
    body.vx += jn * nx;
    body.vy += jn * ny;

    // The contact point slides at v·t − ωr. Friction removes that slip, up to μ times the normal impulse.
    const tx = -ny;
    const ty = nx;
    const slip = body.vx * tx + body.vy * ty - body.w * BALL_R;
    const jt = clamp(slip / (1 + 1 / INERTIA), -MU * jn, MU * jn);
    body.vx -= jt * tx;
    body.vy -= jt * ty;
    body.w += jt / (INERTIA * BALL_R);

    onHit?.({
      part: s.part,
      rim: s.part === "bin" && qy <= BIN.rimY + 0.5,
      x: qx,
      y: qy,
      jx: jn * nx - jt * tx,
      jy: jn * ny - jt * ty,
      speed: -vn,
    });
  }

  if (contact) {
    // A slow ball sits down on one of its flat facets, so the last of its roll dies fast.
    const settling = Math.hypot(body.vx, body.vy) < SETTLE_SPEED ? 3 : 1;
    body.w *= Math.exp(-ROLL_DAMPING * settling * dt);
    body.vx *= Math.exp(-SKID_DAMPING * settling * dt);
  }
  return contact;
}

/** Whether a ball centred here is down inside the bin. */
export function isInBin(x: number, y: number) {
  if (y < BIN.rimY + BALL_R * 0.3) return false;
  const half = mix(BIN.topHalf, BIN.bottomHalf, clamp01((y - BIN.rimY) / BIN_H));
  return Math.abs(x - BIN.cx) < half;
}

/** Runs a throw to rest without drawing it, to see where it ends up. */
export function predictThrow(start: Body) {
  const body = { ...start };
  let rimHits = 0;
  let still = 0;
  for (let t = 0; t < MAX_FLIGHT_S; t += SIM_DT) {
    const contact = stepBody(body, SIM_DT, (hit) => {
      if (hit.rim && hit.speed > 60) rimHits += 1;
    });
    still = contact && Math.hypot(body.vx, body.vy) < REST_SPEED ? still + SIM_DT : 0;
    if (still > REST_S) break;
  }
  return { inBin: isInBin(body.x, body.y), rimHits, x: body.x, y: body.y };
}

/** Where a drag-free ball launched with this velocity crosses `ty` on its way down, with drag. */
function crossingX(x0: number, y0: number, vx: number, vy: number, ty: number) {
  const body = { x: x0, y: y0, vx, vy, w: 0 };
  for (let t = 0; t < 3; t += SIM_DT) {
    const speed = Math.hypot(body.vx, body.vy);
    body.vx -= DRAG * speed * body.vx * SIM_DT;
    body.vy += (G - DRAG * speed * body.vy) * SIM_DT;
    body.x += body.vx * SIM_DT;
    body.y += body.vy * SIM_DT;
    if (body.vy > 0 && body.y >= ty) return body.x;
  }
  return null;
}

/** A flight time that keeps the arc's peak inside the frame. */
function flightTime(x0: number, y0: number, tx: number, ty: number) {
  let time = clamp(0.3 + Math.hypot(tx - x0, ty - y0) / 1300, 0.45, 0.8);
  for (let i = 0; i < 12; i++) {
    const vy = (ty - y0 - 0.5 * G * time * time) / time;
    const peak = vy < 0 ? y0 - (vy * vy) / (2 * G) : y0;
    if (peak >= BALL_R + 8) break;
    time *= 0.93;
  }
  return time;
}

/** Solves the launch for a drag-free arc, then corrects for drag by shooting until it lands on target. */
export function aimAt(x0: number, y0: number, tx: number, ty: number, time: number) {
  let vx = (tx - x0) / time;
  const vy = (ty - y0 - 0.5 * G * time * time) / time;
  for (let i = 0; i < 6; i++) {
    const x = crossingX(x0, y0, vx, vy, ty);
    if (x === null) break;
    vx += (tx - x) / time;
  }
  return { vx, vy };
}

export type Landing = "clean" | "rim" | "short" | "rimOut";

/** Clear of the bin on the near side, where a missed ball can be seen resting. */
const missedClear = (x: number) => x < BIN.cx - BIN.bottomHalf - BALL_R;

/**
 * Picks a launch that really ends the way `landing` says. Each candidate is aimed with some
 * scatter, then run through the same physics the screen will show, so what you see is what was
 * predicted rather than a path bent to fit.
 */
export function planThrow(rng: () => number, x0: number, y0: number, landing: Landing): Body {
  const wantsBin = landing === "clean" || landing === "rim";
  const aim = () => {
    if (landing === "clean") return BIN.cx + (rng() - 0.5) * (BIN.topHalf - BALL_R) * 0.9;
    if (landing === "short") return BIN.cx - BIN.topHalf - BALL_R - 14 - rng() * 70;
    const side = landing === "rimOut" || rng() < 0.5 ? -1 : 1;
    return BIN.cx + side * (BIN.topHalf + (rng() - 0.6) * BALL_R * 1.4);
  };
  const fits = (result: ReturnType<typeof predictThrow>) => {
    if (landing === "clean") return result.inBin && result.rimHits === 0;
    if (landing === "rim") return result.inBin && result.rimHits > 0;
    if (!missedClear(result.x) || result.inBin) return false;
    return landing === "short" || result.rimHits > 0;
  };
  const launch = (tx: number, scatter: number): Body => {
    const ty = BIN.rimY - 2;
    const { vx, vy } = aimAt(x0, y0, tx, ty, flightTime(x0, y0, tx, ty) * scatter);
    // A flick from the hand rolls the ball forward, with a little of its own spin.
    return { x: x0, y: y0, vx, vy, w: (vx / BALL_R) * 0.35 + (rng() - 0.5) * 4 };
  };

  let fallback: Body | null = null;
  for (let i = 0; i < 48; i++) {
    const body = launch(aim(), 0.92 + rng() * 0.16);
    const result = predictThrow(body);
    if (fits(result)) return body;
    const rightSide = wantsBin ? result.inBin : !result.inBin && missedClear(result.x);
    if (!fallback && rightSide) fallback = body;
  }
  return fallback ?? launch(wantsBin ? BIN.cx : PAD + BALL_R + 20, 1);
}

// ---------------------------------------------------------------------------
// The simulated delete request. A real one fails for many reasons, each with its own timing.
// ---------------------------------------------------------------------------

export type FailureKind = "offline" | "timeout" | "server" | "rateLimited" | "syncing";

export const FAILURES: Record<
  FailureKind,
  { latency: readonly [number, number]; message: (name: string) => string }
> = {
  offline: {
    latency: [320, 480],
    message: () => "You’re offline. Check your connection, then retry.",
  },
  timeout: {
    latency: [3600, 4200],
    message: () => "The server didn’t answer in time. Retry in a moment.",
  },
  server: {
    latency: [900, 1400],
    message: () => "Something went wrong on our end. Retry, and it usually goes through.",
  },
  rateLimited: {
    latency: [450, 700],
    message: () => "Too many deletes at once. Wait a few seconds, then retry.",
  },
  syncing: {
    latency: [700, 1000],
    message: (name) => `${name} is still syncing from another device. Retry once it finishes.`,
  },
};
const FAILURE_KINDS = Object.keys(FAILURES) as FailureKind[];
const FAIL_RATE = 0.28;
/** Chosen so a fresh run opens with a rim-in, then a failure, so both endings show early. */
export const DEMO_SEED = 12;

export type Outcome =
  | { ok: true; landing: "clean" | "rim"; latency: number }
  | { ok: false; landing: "short" | "rimOut"; latency: number; failure: FailureKind };

/** A small seeded generator, so a replay plays the same run again. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planOutcome(rng: () => number): Outcome {
  if (rng() >= FAIL_RATE) {
    return {
      ok: true,
      landing: rng() < 1 / 3 ? "rim" : "clean",
      latency: 500 + rng() * 600,
    };
  }
  const failure = FAILURE_KINDS[Math.floor(rng() * FAILURE_KINDS.length)] ?? "server";
  const [min, max] = FAILURES[failure].latency;
  return {
    ok: false,
    failure,
    landing: rng() < 0.5 ? "short" : "rimOut",
    latency: mix(min, max, rng()),
  };
}

// ---------------------------------------------------------------------------
// Photos: landscapes from Unsplash, kept as local copies in public/photos.
// ---------------------------------------------------------------------------

export type PhotoSpec = {
  id: string;
  name: string;
  size: string;
  /** A root-relative path to the image. */
  src: string;
  /** What the photo shows, for screen readers. */
  alt: string;
};

/* oxlint-disable ui-lab/design-tokens -- Prints are physical objects: the paper is the subject, and it looks the same in both themes. */
/** The back of a print. */
const PAPER_BACK = "oklch(0.95 0.008 85)";
/** Content images get a hairline inset outline, neutral so it never fringes. */
const IMAGE_OUTLINE = { light: "oklch(0 0 0 / 0.1)", dark: "oklch(1 0 0 / 0.1)" };
/* oxlint-enable ui-lab/design-tokens */

const images = new Map<string, HTMLImageElement>();

/** One decoded image per path, shared by the tile and the paper it crumples into. */
function photoImage(src: string) {
  let image = images.get(src);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = src;
    images.set(src, image);
  }
  return image;
}

/** Draws an image to cover a box, cropped from its centre, like `object-fit: cover`. */
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, w: number, h: number) {
  const { naturalWidth: iw, naturalHeight: ih } = image;
  if (!image.complete || !iw || !ih) return false;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
  return true;
}

/** Device pixels per stage px: the screen's density times the canvas camera's zoom. */
function pixelRatio(element: HTMLElement) {
  const zoom = element.offsetWidth
    ? element.getBoundingClientRect().width / element.offsetWidth
    : 1;
  return clamp((window.devicePixelRatio || 1) * zoom, 1, 4);
}

type CardColors = {
  surface: string;
  placeholder: string;
  text: string;
  muted: string;
  dark: boolean;
};

function readCardColors(element: HTMLElement): CardColors {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    surface: read("--color-bg-nested"),
    placeholder: read("--color-bg-selected"),
    text: read("--color-text-primary"),
    muted: read("--color-text-secondary"),
    dark: document.documentElement.classList.contains("dark"),
  };
}

type CardShape = { radius: number; photoRadius: number; captionFont: string };

/** The whole tile as one bitmap, so the paper that crumples is exactly the tile that was there. */
function drawCardTexture(photo: PhotoSpec, colors: CardColors, shape: CardShape, ratio: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(TILE_W * ratio);
  canvas.height = Math.ceil(TILE_H * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(ratio, ratio);

  ctx.fillStyle = colors.surface;
  ctx.beginPath();
  ctx.roundRect(0, 0, TILE_W, TILE_H, shape.radius);
  ctx.fill();

  const photoW = TILE_W - PHOTO_INSET * 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(PHOTO_INSET, PHOTO_INSET, photoW, PHOTO_H, shape.photoRadius);
  ctx.clip();
  ctx.translate(PHOTO_INSET, PHOTO_INSET);
  if (!drawCover(ctx, photoImage(photo.src), photoW, PHOTO_H)) {
    ctx.fillStyle = colors.placeholder;
    ctx.fillRect(0, 0, photoW, PHOTO_H);
  }
  ctx.restore();
  ctx.strokeStyle = colors.dark ? IMAGE_OUTLINE.dark : IMAGE_OUTLINE.light;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(
    PHOTO_INSET + 0.5,
    PHOTO_INSET + 0.5,
    photoW - 1,
    PHOTO_H - 1,
    Math.max(0, shape.photoRadius - 0.5),
  );
  ctx.stroke();

  const baseline = PHOTO_INSET + PHOTO_H + CAPTION_H / 2;
  ctx.font = shape.captionFont;
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.fillText(photo.name, PHOTO_INSET + 6, baseline);
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "right";
  ctx.fillText(photo.size, TILE_W - PHOTO_INSET - 6, baseline);
  return canvas;
}

// ---------------------------------------------------------------------------
// Crumpling: the tile becomes a mesh of triangles. Each vertex travels from its place on the flat
// sheet to a spot on a lumpy ball, the edges giving way first, while creases buckle it in depth.
// ---------------------------------------------------------------------------

const MESH = 10;
const PERSPECTIVE = 520;
const BUCKLE = 16;
const LIGHT = (() => {
  const [x, y, z] = [-0.45, -0.6, 0.66];
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length] as const;
})();
/** How bright a face looking straight at the viewer is, which reads as "unshaded". */
const FLAT_LIGHT = LIGHT[2];

type Quat = readonly [number, number, number, number];
const IDENTITY: Quat = [1, 0, 0, 0];

function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function quatAxisAngle(x: number, y: number, z: number, angle: number): Quat {
  const length = Math.hypot(x, y, z) || 1;
  const s = Math.sin(angle / 2) / length;
  return [Math.cos(angle / 2), x * s, y * s, z * s];
}

function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  if (dot > 0.9995) {
    const q = a.map((value, i) => mix(value, (b[i] ?? 0) * sign, t));
    const length = Math.hypot(...q);
    return [q[0]! / length, q[1]! / length, q[2]! / length, q[3]! / length];
  }
  const theta = Math.acos(dot);
  const wa = Math.sin((1 - t) * theta) / Math.sin(theta);
  const wb = (Math.sin(t * theta) / Math.sin(theta)) * sign;
  return [
    a[0] * wa + b[0] * wb,
    a[1] * wa + b[1] * wb,
    a[2] * wa + b[2] * wb,
    a[3] * wa + b[3] * wb,
  ];
}

/** Rotation matrix from a unit quaternion, row-major. */
function quatMatrix(q: Quat) {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - w * x),
    2 * (x * z - w * y),
    2 * (y * z + w * x),
    1 - 2 * (x * x + y * y),
  ] as const;
}

type Mesh = {
  /** Flat position of each vertex, relative to the tile's centre. */
  flat: Float32Array;
  /** Where each vertex ends up on the ball, in 3D. */
  ball: Float32Array;
  /** When each vertex starts to move, as a share of the crumple. */
  delay: Float32Array;
  /** How far a crease lifts or sinks each vertex, -1 to 1. */
  crease: Float32Array;
  /** The way the paper twists while it's crushed. */
  twist: readonly [number, number, number];
};

function buildMesh(rng: () => number): Mesh {
  const count = (MESH + 1) * (MESH + 1);
  const flat = new Float32Array(count * 2);
  const ball = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const crease = new Float32Array(count);
  const folds = Array.from({ length: 6 }, () => {
    const angle = rng() * Math.PI;
    return {
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      offset: (rng() - 0.5) * 1.3,
      sign: rng() < 0.5 ? -1 : 1,
    };
  });

  let i = 0;
  for (let row = 0; row <= MESH; row++) {
    for (let col = 0; col <= MESH; col++, i++) {
      const u = (col / MESH) * 2 - 1;
      const v = (row / MESH) * 2 - 1;
      flat[i * 2] = (u * TILE_W) / 2;
      flat[i * 2 + 1] = (v * TILE_H) / 2;

      // Wrap the sheet around a ball like a gift: the middle faces you, the corners meet behind.
      const reach = Math.hypot(u, v) / Math.SQRT2;
      const polar = reach * Math.PI * 0.94;
      const azimuth = Math.atan2(v * TILE_H, u * TILE_W) + (rng() - 0.5) * 0.6 * reach;
      const radius = BALL_R * (0.9 + rng() * 0.22);
      ball[i * 3] = radius * Math.sin(polar) * Math.cos(azimuth);
      ball[i * 3 + 1] = radius * Math.sin(polar) * Math.sin(azimuth);
      ball[i * 3 + 2] = radius * Math.cos(polar);

      delay[i] = (1 - reach) * 0.22 + rng() * 0.08;
      let ridge = 0;
      for (const fold of folds) {
        ridge +=
          fold.sign * Math.max(0, 1 - Math.abs(u * fold.cos + v * fold.sin - fold.offset) * 2.2);
      }
      crease[i] = clamp(ridge, -1.4, 1.4) + (rng() - 0.5) * 0.35;
    }
  }
  return { flat, ball, delay, crease, twist: [rng() - 0.5, rng() - 0.5, rng() - 0.5] };
}

const MAX_DELAY = 0.3;

/** Vertex positions at crumple progress `p`, rotated by `q`, before perspective. */
function meshAt(mesh: Mesh, p: number, q: Quat, out: Float32Array) {
  const twistAngle = easeInOut(clamp01(p)) * 1.1;
  const rotation = quatMatrix(quatMul(q, quatAxisAngle(...mesh.twist, twistAngle)));
  const count = mesh.delay.length;
  for (let i = 0; i < count; i++) {
    const local = easeInOut(clamp01((p - (mesh.delay[i] ?? 0)) / (1 - MAX_DELAY)));
    const buckle = (mesh.crease[i] ?? 0) * BUCKLE * Math.sin(Math.PI * local);
    const x = mix(mesh.flat[i * 2] ?? 0, mesh.ball[i * 3] ?? 0, local);
    const y = mix(mesh.flat[i * 2 + 1] ?? 0, mesh.ball[i * 3 + 1] ?? 0, local);
    const z = (mesh.ball[i * 3 + 2] ?? 0) * local + buckle;
    out[i * 3] = rotation[0] * x + rotation[1] * y + rotation[2] * z;
    out[i * 3 + 1] = rotation[3] * x + rotation[4] * y + rotation[5] * z;
    out[i * 3 + 2] = rotation[6] * x + rotation[7] * y + rotation[8] * z;
  }
}

type Triangle = { a: number; b: number; c: number; depth: number };
const TRIANGLES: readonly (readonly [number, number, number])[] = (() => {
  const list: [number, number, number][] = [];
  for (let row = 0; row < MESH; row++) {
    for (let col = 0; col < MESH; col++) {
      const i = row * (MESH + 1) + col;
      list.push([i, i + 1, i + MESH + 1], [i + 1, i + MESH + 2, i + MESH + 1]);
    }
  }
  return list;
})();

/** Draws the paper at progress `p`, centred at (cx, cy). The texture maps onto each facet, and each facet is lit by its angle. */
function drawPaper(
  ctx: CanvasRenderingContext2D,
  ball: { mesh: Mesh; texture: HTMLCanvasElement; texScale: number; points: Float32Array },
  cx: number,
  cy: number,
  p: number,
  q: Quat,
) {
  const { mesh, texture, texScale, points } = ball;
  meshAt(mesh, p, q, points);
  const count = mesh.delay.length;
  const screen = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const s = PERSPECTIVE / (PERSPECTIVE - (points[i * 3 + 2] ?? 0));
    screen[i * 2] = cx + (points[i * 3] ?? 0) * s;
    screen[i * 2 + 1] = cy + (points[i * 3 + 1] ?? 0) * s;
  }

  const order: Triangle[] = TRIANGLES.map(([a, b, c]) => ({
    a,
    b,
    c,
    depth: (points[a * 3 + 2] ?? 0) + (points[b * 3 + 2] ?? 0) + (points[c * 3 + 2] ?? 0),
  }));
  order.sort((m, n) => m.depth - n.depth);

  const halfW = TILE_W / 2;
  const halfH = TILE_H / 2;
  for (const { a, b, c } of order) {
    const ax = points[a * 3]!,
      ay = points[a * 3 + 1]!,
      az = points[a * 3 + 2]!;
    const e1x = points[b * 3]! - ax,
      e1y = points[b * 3 + 1]! - ay,
      e1z = points[b * 3 + 2]! - az;
    const e2x = points[c * 3]! - ax,
      e2y = points[c * 3 + 1]! - ay,
      e2z = points[c * 3 + 2]! - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const front = nz >= 0;
    const facing = front ? 1 : -1;
    const light = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) * facing;

    const x0 = screen[a * 2]!,
      y0 = screen[a * 2 + 1]!;
    const x1 = screen[b * 2]!,
      y1 = screen[b * 2 + 1]!;
    const x2 = screen[c * 2]!,
      y2 = screen[c * 2 + 1]!;
    // Grow each facet a hair past its edges so neighbours meet without hairline seams.
    const mx = (x0 + x1 + x2) / 3;
    const my = (y0 + y1 + y2) / 3;
    const grow = (x: number, y: number) => {
      const dx = x - mx;
      const dy = y - my;
      const d = Math.hypot(dx, dy) || 1;
      return [x + (dx / d) * 0.6, y + (dy / d) * 0.6] as const;
    };
    const [gx0, gy0] = grow(x0, y0);
    const [gx1, gy1] = grow(x1, y1);
    const [gx2, gy2] = grow(x2, y2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(gx0, gy0);
    ctx.lineTo(gx1, gy1);
    ctx.lineTo(gx2, gy2);
    ctx.closePath();
    ctx.clip();

    if (front) {
      // Texture coordinates of the three corners, in texture pixels.
      const u0 = (mesh.flat[a * 2]! + halfW) * texScale,
        v0 = (mesh.flat[a * 2 + 1]! + halfH) * texScale;
      const u1 = (mesh.flat[b * 2]! + halfW) * texScale,
        v1 = (mesh.flat[b * 2 + 1]! + halfH) * texScale;
      const u2 = (mesh.flat[c * 2]! + halfW) * texScale,
        v2 = (mesh.flat[c * 2 + 1]! + halfH) * texScale;
      const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
      if (det !== 0) {
        const m11 = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
        const m12 = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
        const m21 = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
        const m22 = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
        ctx.transform(m11, m12, m21, m22, x0 - m11 * u0 - m21 * v0, y0 - m12 * u0 - m22 * v0);
        const sx = Math.max(0, Math.min(u0, u1, u2) - 2);
        const sy = Math.max(0, Math.min(v0, v1, v2) - 2);
        const sw = Math.min(texture.width, Math.max(u0, u1, u2) + 2) - sx;
        const sh = Math.min(texture.height, Math.max(v0, v1, v2) + 2) - sy;
        if (sw > 0 && sh > 0) ctx.drawImage(texture, sx, sy, sw, sh, sx, sy, sw, sh);
      }
    } else {
      ctx.fillStyle = PAPER_BACK;
      ctx.fill();
    }

    // The path was built in screen space, so it still fills the facet whatever the transform.
    const shade = light - FLAT_LIGHT;
    if (Math.abs(shade) > 0.01) {
      ctx.fillStyle =
        shade < 0
          ? // oxlint-disable-next-line ui-lab/design-tokens -- Light on paper, not an interface color.
            `rgb(0 0 0 / ${Math.min(0.6, -shade * 0.85)})`
          : // oxlint-disable-next-line ui-lab/design-tokens -- Light on paper, not an interface color.
            `rgb(255 255 255 / ${Math.min(0.35, shade * 0.7)})`;
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The engine: one canvas over the stage that runs every ball and the bin.
// ---------------------------------------------------------------------------

/* oxlint-disable ui-lab/design-tokens -- The ball's timing is part of the physics experiment. */
const CRUMPLE_S = 0.72;
const LIFT = 10;

/**
 * Where a crumpled ball waits to be thrown: a little above its tile, and clear of the bin's rim when
 * the tile sits under the bin, so a throw never starts inside it.
 */
export function holdPoint(home: { x: number; y: number }) {
  const overBin = Math.abs(home.x - BIN.cx) < BIN.topHalf + BALL_R;
  const y = home.y - LIFT;
  return { x: home.x, y: overBin ? Math.min(y, BIN.rimY - BALL_R - 8) : y };
}
const FLOOR_WAIT_S = 0.4;
const RETURN_S = 0.62;
const UNCRUMPLE_S = 0.5;
const BIN_HIDE_DELAY_S = 0.65;
/** The bin rises and sinks on a slightly bouncy spring, and rocks on a stiffer one when hit. */
const BIN_LIFT = { stiffness: 260, damping: 22 };
const BIN_ROCK = { stiffness: 280, damping: 7, gain: 4e-5, max: 0.14 };
/* oxlint-enable ui-lab/design-tokens */

type BallPhase =
  | "crumple"
  | "hold"
  | "flight"
  | "floor"
  | "return"
  | "uncrumple"
  | "binned"
  | "handoff";

type Ball = {
  id: string;
  mesh: Mesh;
  texture: HTMLCanvasElement;
  texScale: number;
  points: Float32Array;
  rng: () => number;
  phase: BallPhase;
  t: number;
  home: { x: number; y: number };
  body: Body;
  q: Quat;
  tumble: [number, number];
  outcome: Outcome | null;
  landed: boolean;
  still: number;
  flightTime: number;
  accumulator: number;
  from: { x: number; y: number; q: Quat };
};

type EngineEvents = {
  onLaunch: (id: string, outcome: Outcome) => void;
  onLanded: (id: string) => void;
  onReturned: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
  /** Where a returning ball should go: its tile's centre, which may have moved since it left. */
  homeOf: (id: string) => { x: number; y: number } | null;
};

type BinColors = { body: string; inside: string; edge: string; rib: string; shadow: string };

class TrashEngine {
  private balls: Ball[] = [];
  private lift = 0;
  private liftVelocity = 0;
  private rock = 0;
  private rockVelocity = 0;
  private idleFor = 0;
  private frame = 0;
  private last = 0;
  private ratio = 1;
  private busy = false;
  private colors: BinColors | null = null;

  private canvas: HTMLCanvasElement;
  private events: EngineEvents;

  constructor(canvas: HTMLCanvasElement, events: EngineEvents) {
    this.canvas = canvas;
    this.events = events;
  }

  add(
    id: string,
    texture: HTMLCanvasElement,
    texScale: number,
    home: { x: number; y: number },
    seed: number,
  ) {
    if (!this.frame) this.resize();
    this.colors = this.readColors();
    const rng = seeded(seed);
    this.balls.push({
      id,
      mesh: buildMesh(rng),
      texture,
      texScale,
      points: new Float32Array((MESH + 1) * (MESH + 1) * 3),
      rng,
      phase: "crumple",
      t: 0,
      home,
      body: { x: home.x, y: home.y, vx: 0, vy: 0, w: 0 },
      q: IDENTITY,
      tumble: [(rng() - 0.5) * 7, (rng() - 0.5) * 7],
      outcome: null,
      landed: false,
      still: 0,
      flightTime: 0,
      accumulator: 0,
      from: { x: 0, y: 0, q: IDENTITY },
    });
    this.setBusy(true);
    this.draw();
    this.start();
  }

  resolve(id: string, outcome: Outcome) {
    const ball = this.balls.find((b) => b.id === id && b.outcome === null);
    if (ball) ball.outcome = outcome;
  }

  clear() {
    this.balls = [];
    this.lift = 0;
    this.liftVelocity = 0;
    this.rock = 0;
    this.rockVelocity = 0;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.setBusy(false);
    this.draw();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private setBusy(busy: boolean) {
    if (busy === this.busy) return;
    this.busy = busy;
    this.events.onBusyChange(busy);
  }

  private resize() {
    this.ratio = pixelRatio(this.canvas);
    this.canvas.width = Math.ceil(STAGE_W * this.ratio);
    this.canvas.height = Math.ceil(STAGE_H * this.ratio);
  }

  private readColors(): BinColors {
    const style = getComputedStyle(this.canvas);
    const read = (name: string) => style.getPropertyValue(name).trim();
    return {
      body: read("--color-bg-raised"),
      inside: read("--color-bg-selected"),
      edge: read("--color-border-strong"),
      rib: read("--color-border-default"),
      shadow: read("--color-shadow-float"),
    };
  }

  private start() {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    // Inspect's Speed slows the whole scene down, physics included, which makes it easy to study.
    const dt = Math.min(0.05, (now - this.last) / 1000) * getMotionTuning().timeScale;
    this.last = now;
    this.update(dt);
    this.draw();
    const settled =
      this.balls.length === 0 && this.lift < 0.001 && Math.abs(this.liftVelocity) < 0.001;
    this.frame = settled ? 0 : requestAnimationFrame(this.tick);
  };

  private update(dt: number) {
    for (const ball of this.balls) this.advance(ball, dt);
    this.balls = this.balls.filter((ball) => ball.phase !== "handoff" || ball.t < 0.05);

    const active = this.balls.some((ball) => ball.phase !== "binned");
    this.idleFor = active ? 0 : this.idleFor + dt;
    this.setBusy(active);
    const target = active || this.idleFor < BIN_HIDE_DELAY_S ? 1 : 0;
    const accel = BIN_LIFT.stiffness * (target - this.lift) - BIN_LIFT.damping * this.liftVelocity;
    this.liftVelocity += accel * dt;
    this.lift += this.liftVelocity * dt;
    const rockAccel = -BIN_ROCK.stiffness * this.rock - BIN_ROCK.damping * this.rockVelocity;
    this.rockVelocity += rockAccel * dt;
    this.rock = clamp(this.rock + this.rockVelocity * dt, -BIN_ROCK.max, BIN_ROCK.max);

    if (target === 0 && this.lift < 0.02) {
      // The bin has gone below the edge, and the paper in it with it.
      this.balls = this.balls.filter((ball) => ball.phase !== "binned");
      if (this.balls.length === 0 && this.lift < 0.001) {
        this.lift = 0;
        this.liftVelocity = 0;
      }
    }
  }

  private advance(ball: Ball, dt: number) {
    ball.t += dt;
    switch (ball.phase) {
      case "crumple":
        if (ball.t >= CRUMPLE_S) this.enter(ball, "hold");
        break;
      case "hold":
        if (ball.outcome && this.lift > 0.97) this.launch(ball, ball.outcome);
        break;
      case "flight":
        this.fly(ball, dt);
        break;
      case "floor":
        if (ball.t >= FLOOR_WAIT_S) {
          ball.from = { x: ball.body.x, y: ball.body.y, q: ball.q };
          this.enter(ball, "return");
        }
        break;
      case "return": {
        const k = easeInOut(clamp01(ball.t / RETURN_S));
        const home = this.events.homeOf(ball.id) ?? ball.home;
        ball.home = home;
        const toY = holdPoint(home).y;
        // A lob back to the tile, peaking above both ends.
        const peak = Math.min(ball.from.y, toY) - 60;
        const inv = 1 - k;
        ball.body.x = mix(ball.from.x, home.x, k);
        ball.body.y = inv * inv * ball.from.y + 2 * inv * k * peak + k * k * toY;
        ball.q = quatSlerp(ball.from.q, IDENTITY, k);
        if (ball.t >= RETURN_S) this.enter(ball, "uncrumple");
        break;
      }
      case "uncrumple":
        if (ball.t >= UNCRUMPLE_S) {
          this.enter(ball, "handoff");
          this.events.onReturned(ball.id);
        }
        break;
      default:
        break;
    }
  }

  private enter(ball: Ball, phase: BallPhase) {
    ball.phase = phase;
    ball.t = 0;
  }

  private launch(ball: Ball, outcome: Outcome) {
    const x = ball.home.x;
    const { y } = holdPoint(ball.home);
    ball.body = planThrow(ball.rng, x, y, outcome.landing);
    this.enter(ball, "flight");
    this.events.onLaunch(ball.id, outcome);
  }

  private fly(ball: Ball, dt: number) {
    ball.accumulator += dt;
    const pivotX = BIN.cx;
    const pivotY = FLOOR_Y;
    while (ball.accumulator >= SIM_DT) {
      ball.accumulator -= SIM_DT;
      ball.flightTime += SIM_DT;
      const contact = stepBody(ball.body, SIM_DT, (hit) => {
        if (hit.part !== "bin") return;
        // The bin takes the opposite impulse, and rocks about its base by the torque it makes.
        const torque = (hit.x - pivotX) * -hit.jy - (hit.y - pivotY) * -hit.jx;
        this.rockVelocity += torque * BIN_ROCK.gain;
      });
      if (contact) {
        ball.tumble[0] *= 0.9;
        ball.tumble[1] *= 0.9;
      }
      const { body } = ball;
      if (!ball.landed && isInBin(body.x, body.y)) {
        ball.landed = true;
        this.events.onLanded(ball.id);
      }
      ball.still = contact && Math.hypot(body.vx, body.vy) < REST_SPEED ? ball.still + SIM_DT : 0;
      if (ball.still > REST_S || ball.flightTime > MAX_FLIGHT_S) {
        this.enter(ball, isInBin(body.x, body.y) ? "binned" : "floor");
        return;
      }
    }
    const spin = Math.hypot(ball.tumble[0], ball.tumble[1], ball.body.w);
    if (spin > 0) {
      ball.q = quatMul(
        quatAxisAngle(ball.tumble[0], ball.tumble[1], ball.body.w, spin * dt),
        ball.q,
      );
    }
  }

  private binOffset() {
    return (1 - this.lift) * (BIN_H + 28);
  }

  private draw() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    const colors = this.colors;
    const drop = this.binOffset();
    const binShown = colors && this.lift > 0.001;

    // Contact shadows for anything in the air, fading with height.
    for (const ball of this.balls) {
      if (ball.phase !== "flight" && ball.phase !== "floor") continue;
      const height = FLOOR_Y - ball.body.y - BALL_R;
      const alpha = 0.35 * (1 - clamp01(height / 260));
      if (alpha <= 0.01 || !colors) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colors.shadow;
      ctx.beginPath();
      ctx.ellipse(
        ball.body.x,
        FLOOR_Y,
        BALL_R * (1 - clamp01(height / 400) * 0.4),
        3,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    const inside = this.balls.filter(
      (ball) =>
        ball.phase === "binned" ||
        (ball.phase === "flight" &&
          ball.body.y > BIN.rimY - BALL_R &&
          Math.abs(ball.body.x - BIN.cx) < BIN.topHalf),
    );
    const outside = this.balls.filter((ball) => !inside.includes(ball));

    if (binShown) this.drawBin(ctx, colors, drop, "back");
    if (inside.length > 0) {
      // Paper in the bin moves with it and is cut to its walls, so nothing pokes through the sides
      // or the base when it rocks or sinks. Above the rim it shows in full.
      const { cx, rimY, topHalf, bottomHalf } = BIN;
      ctx.save();
      this.binTransform(ctx, drop);
      ctx.beginPath();
      ctx.moveTo(-STAGE_W, -STAGE_H);
      ctx.lineTo(STAGE_W * 2, -STAGE_H);
      ctx.lineTo(STAGE_W * 2, rimY);
      ctx.lineTo(cx + topHalf, rimY);
      ctx.lineTo(cx + bottomHalf, FLOOR_Y);
      ctx.lineTo(cx - bottomHalf, FLOOR_Y);
      ctx.lineTo(cx - topHalf, rimY);
      ctx.lineTo(-STAGE_W, rimY);
      ctx.closePath();
      ctx.clip();
      for (const ball of inside) this.drawBall(ctx, ball, 0);
      ctx.restore();
    }
    if (binShown) this.drawBin(ctx, colors, drop, "front");
    for (const ball of outside) this.drawBall(ctx, ball, 0);
  }

  private drawBall(ctx: CanvasRenderingContext2D, ball: Ball, dy: number) {
    let p = 1;
    let x = ball.body.x;
    let y = ball.body.y;
    if (ball.phase === "crumple") {
      p = clamp01(ball.t / CRUMPLE_S);
      x = ball.home.x;
      y = mix(ball.home.y, holdPoint(ball.home).y, easeOut(p));
    } else if (ball.phase === "hold") {
      // Waiting on the server: the ball hangs where it was crushed, shifting a little in the hand.
      x = ball.home.x;
      y = holdPoint(ball.home).y + Math.sin(ball.t * 7) * 1.2 * clamp01(ball.t * 4);
    } else if (ball.phase === "uncrumple" || ball.phase === "handoff") {
      const k = ball.phase === "handoff" ? 1 : clamp01(ball.t / UNCRUMPLE_S);
      p = 1 - easeInOut(k);
      x = ball.home.x;
      y = mix(holdPoint(ball.home).y, ball.home.y, easeInOut(k));
    }
    drawPaper(ctx, ball, x, y + dy, p, ball.q);
  }

  /** Rocks about the middle of the base, and sinks by `drop`. */
  private binTransform(ctx: CanvasRenderingContext2D, drop: number) {
    ctx.translate(0, drop);
    ctx.translate(BIN.cx, FLOOR_Y);
    ctx.rotate(this.rock);
    ctx.translate(-BIN.cx, -FLOOR_Y);
  }

  private drawBin(
    ctx: CanvasRenderingContext2D,
    colors: BinColors,
    drop: number,
    layer: "back" | "front",
  ) {
    const { cx, rimY, topHalf, bottomHalf } = BIN;
    const rimRy = 6;
    ctx.save();
    this.binTransform(ctx, drop);
    ctx.lineJoin = "round";

    if (layer === "back") {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = colors.shadow;
      ctx.beginPath();
      ctx.ellipse(cx, FLOOR_Y, bottomHalf + 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // The opening: the far half of the rim and the dark inside.
      ctx.fillStyle = colors.inside;
      ctx.beginPath();
      ctx.ellipse(cx, rimY, topHalf, rimRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, rimY, topHalf, rimRy, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    } else {
      const radius = 6;
      ctx.beginPath();
      ctx.moveTo(cx + topHalf, rimY);
      ctx.lineTo(cx + bottomHalf, FLOOR_Y - radius);
      ctx.quadraticCurveTo(cx + bottomHalf, FLOOR_Y, cx + bottomHalf - radius, FLOOR_Y);
      ctx.lineTo(cx - bottomHalf + radius, FLOOR_Y);
      ctx.quadraticCurveTo(cx - bottomHalf, FLOOR_Y, cx - bottomHalf, FLOOR_Y - radius);
      ctx.lineTo(cx - topHalf, rimY);
      ctx.ellipse(cx, rimY, topHalf, rimRy, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fillStyle = colors.body;
      ctx.fill();
      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Ribs that follow the taper.
      ctx.strokeStyle = colors.rib;
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      for (const share of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(cx + share * topHalf * 0.86, rimY + rimRy + 10);
        ctx.lineTo(cx + share * bottomHalf * 0.86, FLOOR_Y - 10);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The interface.
// ---------------------------------------------------------------------------

type Phase = "idle" | "deleting" | "gone";
type PhotoState = PhotoSpec & { phase: Phase; failure: FailureKind | null };

const fresh = (photos: readonly PhotoSpec[]): PhotoState[] =>
  photos.map((photo) => ({ ...photo, phase: "idle", failure: null }));

export function PhotoDelete({ photos }: { photos: PhotoSpec[] }) {
  const shape = useShape();
  const size = useSize();
  const icons = useIcons();
  const reduceMotion = useReducedMotionConfig() ?? false;

  const [items, setItems] = useState(() => fresh(photos));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(photos[0]?.id ?? null);
  const [alert, setAlert] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [generation, setGeneration] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const toggles = useRef(new Map<string, HTMLButtonElement>());
  const engineRef = useRef<TrashEngine | null>(null);
  const rngRef = useRef(seeded(DEMO_SEED));
  const timers = useRef(new Set<number>());
  const keyboard = useRef(false);
  const pendingFailures = useRef(new Map<string, FailureKind>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    for (const photo of photos) photoImage(photo.src);
  }, [photos]);

  const shown = items.filter((item) => item.phase !== "gone");
  const nameOf = (id: string) => itemsRef.current.find((item) => item.id === id)?.name ?? "Photo";

  const homeOf = useCallback((id: string) => {
    const index = itemsRef.current
      .filter((item) => item.phase !== "gone")
      .findIndex((item) => item.id === id);
    if (index < 0) return null;
    const origin = slotOrigin(index);
    return { x: origin.x + TILE_W / 2, y: origin.y + TILE_H / 2 };
  }, []);

  const setPhase = useCallback((id: string, phase: Phase, failure: FailureKind | null = null) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, phase, failure } : item)),
    );
    if (failure) {
      // No banner: the tile itself shows the failure, and screen readers hear how to recover.
      const name = itemsRef.current.find((item) => item.id === id)?.name ?? "The photo";
      setAlert(`Couldn’t delete ${name}. ${FAILURES[failure].message(name)}`);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new TrashEngine(canvas, {
      homeOf,
      onBusyChange: setBusy,
      onLaunch: (id, outcome) => {
        if (outcome.ok) setPhase(id, "gone");
      },
      onLanded: (id) => setStatus(`${nameOf(id)} deleted`),
      onReturned: (id) => {
        const failure = pendingFailures.current.get(id) ?? "server";
        pendingFailures.current.delete(id);
        setStatus("");
        setPhase(id, "idle", failure);
      },
    });
    engineRef.current = engine;
    const pending = timers.current;
    return () => {
      engine.destroy();
      engineRef.current = null;
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
    // nameOf reads a ref, so the engine never needs rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeOf, setPhase]);

  const later = (ms: number, run: () => void) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  };

  /** Hands focus on to the next photo's control, so a deleted one never strands it. */
  const passFocus = (id: string) => {
    const remaining = itemsRef.current.filter((item) => item.phase === "idle");
    const index = remaining.findIndex((item) => item.id === id);
    const next = remaining[index + 1] ?? remaining[index - 1];
    if (next) {
      setFocusId(next.id);
      // A pointer user shouldn't see a ring jump to the next photo, only a keyboard user.
      toggles.current.get(next.id)?.focus({ focusVisible: keyboard.current });
    } else {
      replayRef.current?.focus({ focusVisible: keyboard.current });
    }
  };

  const runDelete = (id: string) => {
    const photo = itemsRef.current.find((item) => item.id === id);
    const stage = stageRef.current;
    if (!photo || photo.phase !== "idle" || !stage) return;
    const hadFocus = stage.contains(document.activeElement);
    setConfirming(null);
    setAlert("");
    if (hadFocus) passFocus(id);

    const outcome = planOutcome(rngRef.current);
    const seed = Math.floor(rngRef.current() * 2 ** 31);
    const home = homeOf(id);
    const engine = engineRef.current;
    setStatus(`Deleting ${photo.name}…`);

    if (reduceMotion || !engine || !home) {
      setPhase(id, "deleting");
      later(outcome.latency, () => {
        if (outcome.ok) {
          setPhase(id, "gone");
          setStatus(`${photo.name} deleted`);
        } else {
          setStatus("");
          setPhase(id, "idle", outcome.failure);
        }
      });
      return;
    }

    const ratio = pixelRatio(stage);
    const texture = drawCardTexture(
      photo,
      readCardColors(stage),
      {
        radius: shape.bgRadius,
        photoRadius: nestedRadius(shape.bgRadius, PHOTO_INSET),
        captionFont: `${size.variant === "compact" ? 11 : 12}px "Inter Variable", sans-serif`,
      },
      ratio,
    );
    engine.add(id, texture, ratio, home, seed);
    setPhase(id, "deleting");
    if (!outcome.ok) pendingFailures.current.set(id, outcome.failure);
    later(outcome.latency, () => engine.resolve(id, outcome));
  };

  const replay = () => {
    if (busy) return;
    engineRef.current?.clear();
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current.clear();
    pendingFailures.current.clear();
    rngRef.current = seeded(DEMO_SEED);
    setItems(fresh(photos));
    setAlert("");
    setConfirming(null);
    setFocusId(photos[0]?.id ?? null);
    setGeneration((value) => value + 1);
    setStatus("Photos restored");
  };

  const moveFocus = (event: KeyboardEvent, id: string) => {
    const reachable = shown.filter((item) => item.phase === "idle");
    const index = reachable.findIndex((item) => item.id === id);
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLS,
      ArrowUp: -COLS,
    };
    let next: number | null = null;
    if (event.key in step) next = clamp(index + (step[event.key] ?? 0), 0, reachable.length - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = reachable.length - 1;
    const target = next === null ? undefined : reachable[next];
    if (!target) return;
    event.preventDefault();
    setConfirming(null);
    setFocusId(target.id);
    toggles.current.get(target.id)?.focus();
  };

  // The roving stop falls back to the first photo that can still take it.
  const rovingId =
    shown.find((item) => item.id === focusId && item.phase === "idle")?.id ??
    shown.find((item) => item.phase === "idle")?.id ??
    null;

  return (
    <div
      ref={stageRef}
      onKeyDownCapture={() => (keyboard.current = true)}
      onPointerDownCapture={() => (keyboard.current = false)}
      className={cn(
        "relative isolate h-full w-full overflow-hidden",
        shape.container,
        size.type.body,
      )}
      style={{ width: STAGE_W, height: STAGE_H }}
    >
      <header className="absolute top-4 right-4 left-4 flex h-7 items-center justify-between">
        <h3 className={cn("flex items-baseline gap-1.5 text-text-primary", size.type.subtitle)}>
          <span style={{ fontVariationSettings: fontWeights.semibold }}>Photos</span>
          <span className="text-text-secondary tabular-nums">{shown.length}</span>
        </h3>
        <Button
          ref={replayRef}
          variant="ghost"
          size="compact"
          leadingIcon={icons["rotate-ccw"]}
          aria-disabled={busy || undefined}
          className={cn(busy && "opacity-50")}
          onClick={replay}
        >
          Replay
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {shown.map((item, index) => (
          <PhotoTile
            key={`${generation}-${item.id}`}
            photo={item}
            index={index}
            reduceMotion={reduceMotion}
            confirming={confirming === item.id}
            tabStop={rovingId === item.id}
            toggleRef={(element) => {
              if (element) toggles.current.set(item.id, element);
              else toggles.current.delete(item.id);
            }}
            onOpen={() => {
              setFocusId(item.id);
              setConfirming(item.id);
            }}
            onClose={(refocus) => {
              setConfirming(null);
              if (refocus) toggles.current.get(item.id)?.focus();
            }}
            onConfirm={() => runDelete(item.id)}
            onKeyDown={(event) => moveFocus(event, item.id)}
          />
        ))}
      </AnimatePresence>

      {shown.length === 0 && (
        <div
          className="absolute flex flex-col items-center justify-center gap-1 text-center"
          style={{ left: PAD, right: PAD, top: GRID_TOP, height: TILE_H * 2 + GAP }}
        >
          <p className={cn("text-text-primary", size.type.subtitle)}>No photos left</p>
          <p className={cn("text-text-secondary", size.type.caption)}>Replay brings them back.</p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{ width: STAGE_W, height: STAGE_H }}
      />
      <p role="status" className="sr-only">
        {status}
      </p>
      <p role="alert" className="sr-only">
        {alert}
      </p>
    </div>
  );
}

function PhotoTile({
  photo,
  index,
  reduceMotion,
  confirming,
  tabStop,
  toggleRef,
  onOpen,
  onClose,
  onConfirm,
  onKeyDown,
}: {
  photo: PhotoState;
  index: number;
  reduceMotion: boolean;
  confirming: boolean;
  tabStop: boolean;
  toggleRef: (element: HTMLButtonElement | null) => void;
  onOpen: () => void;
  onClose: (refocus: boolean) => void;
  onConfirm: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  const shape = useShape();
  const size = useSize();
  const origin = slotOrigin(index);
  const deleting = photo.phase === "deleting";
  // With motion, the canvas carries the tile while it's away. Without, the tile stays and dims.
  const away = deleting && !reduceMotion;
  // Hover from real pointer moves only, so a tile that slides under a resting cursor stays quiet.
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, x: origin.x, y: origin.y }}
      animate={{
        opacity: deleting && reduceMotion ? 0.45 : 1,
        scale: 1,
        x: origin.x,
        y: origin.y,
      }}
      exit={{ opacity: 0, transition: reduceMotion ? spring.moderate.exit : { duration: 0 } }}
      transition={spring.slow}
      className={cn(
        "absolute top-0 left-0 bg-bg-nested",
        shape.bg,
        photo.failure && "ring-2 ring-danger-solid",
      )}
      style={{
        width: TILE_W,
        height: TILE_H,
        visibility: away ? "hidden" : "visible",
        padding: PHOTO_INSET,
      }}
      aria-busy={deleting || undefined}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse" && !hovered) setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <Photo src={photo.src} alt={photo.alt} radius={nestedRadius(shape.bgRadius, PHOTO_INSET)} />
      <div
        className={cn("flex items-center justify-between gap-2 px-1.5", size.type.caption)}
        style={{ height: CAPTION_H }}
      >
        <span
          className="truncate text-text-primary"
          style={{ fontVariationSettings: fontWeights.normal }}
          title={photo.name}
        >
          {photo.name}
        </span>
        {photo.failure ? (
          <span className="shrink-0 text-danger-text">Not deleted</span>
        ) : deleting ? (
          <span className="shrink-0 text-text-secondary">Deleting…</span>
        ) : (
          <span className="shrink-0 text-text-secondary tabular-nums">{photo.size}</span>
        )}
      </div>
      {!deleting && (
        <ConfirmControl
          name={photo.name}
          open={confirming}
          revealed={hovered}
          tabStop={tabStop}
          toggleRef={toggleRef}
          onOpen={onOpen}
          onClose={onClose}
          onConfirm={onConfirm}
          onKeyDown={onKeyDown}
        />
      )}
    </motion.div>
  );
}

function Photo({ src, alt, radius }: { src: string; alt: string; radius: number }) {
  const width = TILE_W - PHOTO_INSET * 2;
  return (
    <div
      className="relative overflow-hidden bg-bg-selected"
      style={{ borderRadius: radius, width, height: PHOTO_H }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        className="block size-full object-cover select-none"
      />
      {/* oxlint-disable-next-line ui-lab/design-tokens -- Content images take a neutral hairline, per DESIGN.md. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1)] dark:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)]"
        style={{ borderRadius: radius }}
      />
    </div>
  );
}

/**
 * The trash button that becomes its own confirmation. One surface widens leftward from the button,
 * and the button itself turns into Cancel, so the pointer that opened it rests on the safe choice.
 */
function ConfirmControl({
  name,
  open,
  revealed,
  tabStop,
  toggleRef,
  onOpen,
  onClose,
  onConfirm,
  onKeyDown,
}: {
  name: string;
  open: boolean;
  revealed: boolean;
  tabStop: boolean;
  toggleRef: (element: HTMLButtonElement | null) => void;
  onOpen: () => void;
  onClose: (refocus: boolean) => void;
  onConfirm: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  const shape = useShape();
  const size = useSize();
  const icons = useIcons();
  const touch = useTouchPrimary();
  const reduceMotion = useReducedMotionConfig() ?? false;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const [openWidth, setOpenWidth] = useState(CONTROL);
  const toggle = useSelfFluidHover<HTMLButtonElement>(toggleRef);
  const confirm = useSelfFluidHover<HTMLButtonElement>();

  useLayoutEffect(() => {
    // Measured unscaled, so the canvas zoom never skews it, and again whenever it resizes: the
    // label's width changes with Size, and once Inter finishes loading on a first visit.
    const action = actionRef.current;
    if (!action) return;
    const measure = () => setOpenWidth(CONTROL + action.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(action);
    return () => observer.disconnect();
  }, []);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!surfaceRef.current?.contains(event.target as Node)) closeRef.current(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);

  const Trash = icons.trash;
  const Close = icons.x;
  const glyph = { opacity: 1, scale: 1, filter: "blur(0px)" };
  const hidden = { opacity: 0, scale: 0.6, filter: reduceMotion ? "blur(0px)" : "blur(4px)" };
  const swap = (shown: boolean) =>
    shown
      ? { duration: spring.fast.duration, ease: "easeOut" as const }
      : { ...spring.fast.exit, ease: "easeIn" as const };
  const inner = nestedRadius(shape.bgRadius, 2);

  return (
    <motion.div
      ref={surfaceRef}
      initial={false}
      animate={{ width: open ? openWidth : CONTROL }}
      // Closed, the surface is the button, so the whole surface presses. Open, each button does.
      whileTap={open ? undefined : { scale: 0.88 }}
      // Motion makes a pressable element focusable. The button inside is the tab stop, not this.
      tabIndex={-1}
      onBlur={(event) => {
        if (open && !surfaceRef.current?.contains(event.relatedTarget as Node | null)) {
          onClose(false);
        }
      }}
      transition={reduceMotion ? { duration: 0 } : open ? spring.moderate : spring.moderate.exit}
      className={cn(
        "absolute flex flex-row-reverse items-center overflow-hidden bg-bg-raised shadow-surface-2",
        shape.button,
        // Closed, the button fills the surface, whose clip would hide the button's own ring.
        !open && "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-focus",
        // Shown on hover, focus, and touch; hidden it takes no taps.
        !open &&
          !touch &&
          !revealed &&
          "pointer-events-none opacity-0 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100",
        "transition-opacity duration-[var(--spring-fast,80ms)]",
      )}
      style={{
        top: PHOTO_INSET + CONTROL_INSET,
        right: PHOTO_INSET + CONTROL_INSET,
        height: CONTROL,
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        }
      }}
    >
      <motion.button
        ref={toggle.ref}
        type="button"
        aria-label={open ? `Keep ${name}` : `Delete ${name}`}
        aria-expanded={open}
        tabIndex={tabStop || open ? 0 : -1}
        {...(open ? pressMotion(0.88) : {})}
        {...toggle.hover.handlers}
        onClick={() => (open ? onClose(true) : onOpen())}
        onKeyDown={(event) => {
          if (!open) onKeyDown(event);
        }}
        className={cn(
          "relative grid shrink-0 cursor-pointer place-items-center text-text-secondary outline-none [-webkit-tap-highlight-color:transparent] data-[fluid-hover-active-index]:text-text-primary",
          open && "focus-visible:ring-2 focus-visible:ring-border-focus",
        )}
        // Alone, the button is the whole surface. Beside Delete it sits inset like its neighbour, so
        // both fills are concentric with the pill. The glyph stays put either way.
        style={
          open
            ? { width: CONTROL - 4, height: CONTROL - 4, margin: 2, borderRadius: inner }
            : { width: CONTROL, height: CONTROL, borderRadius: shape.bgRadius }
        }
      >
        <SelfFluidHoverLayer self={toggle} />
        <motion.span
          className="relative col-start-1 row-start-1 flex"
          initial={false}
          animate={open ? hidden : glyph}
          transition={swap(!open)}
        >
          <Trash size={size.icon} strokeWidth={1.5} />
        </motion.span>
        <motion.span
          className="relative col-start-1 row-start-1 flex"
          initial={false}
          animate={open ? glyph : hidden}
          transition={swap(open)}
        >
          <Close size={size.icon} strokeWidth={1.5} />
        </motion.span>
      </motion.button>

      <motion.div
        ref={actionRef}
        inert={!open}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={
          open
            ? {
                duration: spring.moderate.duration * 0.6,
                delay: reduceMotion ? 0 : spring.moderate.duration * 0.35,
              }
            : { duration: spring.fast.exit.duration }
        }
        className="flex shrink-0 items-center py-0.5 pl-0.5"
      >
        <motion.button
          ref={confirm.ref}
          type="button"
          {...pressMotion()}
          {...confirm.hover.handlers}
          onClick={onConfirm}
          className={cn(
            "relative flex h-6 cursor-pointer items-center bg-danger-solid px-2.5 whitespace-nowrap text-danger-on-solid outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-border-focus",
            size.type.caption,
          )}
          style={
            { borderRadius: inner, fontVariationSettings: fontWeights.semibold } as CSSProperties
          }
        >
          <SelfFluidHoverLayer self={confirm} className="bg-danger-solid-hover" />
          <span className="relative [text-box:trim-both_cap_alphabetic]">Delete</span>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
