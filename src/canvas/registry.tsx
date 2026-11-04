import type { ComponentType, ReactNode } from "react";

import { GitHubContributions } from "./previews/github-contributions";

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
export const canvasEntries: readonly CanvasEntry[] = [
  preview({
    id: "github-contributions",
    name: "GitHub contributions",
    purpose:
      "Shows a GitHub account's public contributions over the past year as a grid of days, one column per week, darker or lighter by how much happened that day. Hovering or arrowing through days moves one highlight and one tooltip that names the count and date, and the grid holds its shape while loading and offers a retry if the data can't be reached.",
    source: "/src/canvas/previews/github-contributions.tsx",
    width: 878,
    height: 198,
    x: -439,
    y: -99,
    component: GitHubContributions,
    // The owner's real public account, on request, so this preview fetches live data.
    props: { username: "metaloozee" },
  }),
];
