import { DEFAULT_MOTION, type MotionTuning, SPRING_TIERS } from "@/lib/springs";

import { type Camera, clampCamera, clampCoordinate, type Point } from "./geometry";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Picker order. Blue is the default, and None sits last because it means "accent off". */
export const ACCENTS = ["blue", "violet", "pink", "orange", "green", "teal", "none"] as const;
export type Accent = (typeof ACCENTS)[number];

export const SHAPES = ["rounded", "pill"] as const;
export type Shape = (typeof SHAPES)[number];

export const DENSITIES = ["default", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export type Preferences = {
  theme: Theme;
  accent: Accent;
  shape: Shape;
  density: Density;
  motion: MotionTuning;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  accent: "blue",
  shape: "rounded",
  density: "default",
  motion: DEFAULT_MOTION,
};

export type SavedLayout = {
  camera: Camera | null;
  preferences: Preferences;
  positions: Map<string, Point>;
};

const STORAGE_KEY = "ui-lab:canvas:main";
const VERSION = 1;
const MAX_DOCUMENT_LENGTH = 256_000;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const emptyLayout = (): SavedLayout => ({
  camera: null,
  preferences: { ...DEFAULT_PREFERENCES },
  positions: new Map(),
});

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  return isFiniteNumber(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function parseMotion(value: unknown): MotionTuning {
  if (!isRecord(value)) return DEFAULT_MOTION;
  const motion: MotionTuning = {
    ...DEFAULT_MOTION,
    timeScale: boundedNumber(value.timeScale, 0.05, 2, DEFAULT_MOTION.timeScale),
    reducedMotion: oneOf(
      ["user", "always", "never"],
      value.reducedMotion,
      DEFAULT_MOTION.reducedMotion,
    ),
  };
  for (const tier of SPRING_TIERS) {
    const saved = value[tier];
    const fallback = DEFAULT_MOTION[tier];
    if (!isRecord(saved)) continue;
    motion[tier] = {
      duration: boundedNumber(saved.duration, 0.01, 3, fallback.duration),
      bounce: boundedNumber(saved.bounce, 0, 0.9, fallback.bounce),
      exit: boundedNumber(saved.exit, 0.01, 3, fallback.exit),
    };
  }
  return motion;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

/** Keeps only valid values for items that still exist; source owns everything else. */
export function parseLayout(raw: string | null, currentIds: ReadonlySet<string>): SavedLayout {
  if (!raw || raw.length > MAX_DOCUMENT_LENGTH) return emptyLayout();

  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch {
    return emptyLayout();
  }
  if (!isRecord(document) || document.version !== VERSION) return emptyLayout();

  const layout = emptyLayout();

  const { camera, positions } = document;
  if (
    isRecord(camera) &&
    isFiniteNumber(camera.x) &&
    isFiniteNumber(camera.y) &&
    isFiniteNumber(camera.zoom) &&
    camera.zoom > 0
  ) {
    layout.camera = clampCamera({ x: camera.x, y: camera.y, zoom: camera.zoom });
  }
  layout.preferences = {
    theme: oneOf(THEMES, document.theme, DEFAULT_PREFERENCES.theme),
    accent: oneOf(ACCENTS, document.accent, DEFAULT_PREFERENCES.accent),
    shape: oneOf(SHAPES, document.shape, DEFAULT_PREFERENCES.shape),
    density: oneOf(DENSITIES, document.density, DEFAULT_PREFERENCES.density),
    motion: parseMotion(document.motion),
  };
  if (isRecord(positions)) {
    for (const id of currentIds) {
      if (!Object.hasOwn(positions, id)) continue;
      const position = positions[id];
      if (isRecord(position) && isFiniteNumber(position.x) && isFiniteNumber(position.y)) {
        layout.positions.set(id, {
          x: clampCoordinate(position.x),
          y: clampCoordinate(position.y),
        });
      }
    }
  }
  return layout;
}

export function serializeLayout(layout: {
  camera: Camera;
  preferences: Preferences;
  positions: ReadonlyMap<string, Point>;
}): string {
  return JSON.stringify({
    version: VERSION,
    camera: layout.camera,
    ...layout.preferences,
    positions: Object.fromEntries(layout.positions),
  });
}

export function readLayout(currentIds: ReadonlySet<string>): SavedLayout {
  try {
    return parseLayout(window.localStorage.getItem(STORAGE_KEY), currentIds);
  } catch {
    return emptyLayout();
  }
}

export function writeLayout(serialized: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Storage can be blocked or full. The canvas keeps working; the layout just won't persist.
  }
}
