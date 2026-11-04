import type { ComponentType, ReactNode } from "react";

export type CanvasEntry = {
  /** Stable key for saved positions. Keep it when renaming. */
  id: string;
  /** Unique and readable. Search finds items by it. */
  name: string;
  /** What it's for and how it behaves. Search reads it, and the copied prompt opens with it. */
  purpose: string;
  /** Root-relative path of its component file. The copied prompt follows imports from here. */
  source: string;
  /** What the preview was given, so the copied prompt can show it. */
  previewProps?: unknown;
  width: number;
  height: number;
  /** Where the preview starts, in canvas coordinates. (0, 0) is the middle of a reset camera. */
  x: number;
  y: number;
  render: () => ReactNode;
};

export function preview<P extends object>(
  entry: Omit<CanvasEntry, "render" | "previewProps"> & {
    component: ComponentType<P>;
    /** Synthetic data only. Previews must not reach real services. */
    props: P;
  },
): CanvasEntry {
  const { component: Component, props, ...rest } = entry;
  return { ...rest, previewProps: props, render: () => <Component {...props} /> };
}

/** Add, rename, or remove canvas items here. Nothing else needs to change. */
export const canvasEntries: readonly CanvasEntry[] = [];
