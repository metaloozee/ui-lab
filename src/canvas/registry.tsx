import type { ComponentType, ReactNode } from "react";

import { BadgeColors } from "./previews/badge-colors";
import { PrimaryButton } from "./previews/primary-button";
import { StatusBanners } from "./previews/status-banners";

export type CanvasEntry = {
  /** Stable key for saved positions. Keep it when renaming. */
  id: string;
  /** Unique, readable, and copied when the label is clicked. */
  name: string;
  width: number;
  height: number;
  /** Where the preview starts, in canvas coordinates. (0, 0) is the middle of a reset camera. */
  x: number;
  y: number;
  render: () => ReactNode;
};

function preview<P extends object>(
  entry: Omit<CanvasEntry, "render"> & {
    component: ComponentType<P>;
    /** Synthetic data only. Previews must not reach real services. */
    props: P;
  },
): CanvasEntry {
  const { component: Component, props, ...rest } = entry;
  return { ...rest, render: () => <Component {...props} /> };
}

/** Add, rename, or remove canvas items here. Nothing else needs to change. */
export const canvasEntries: readonly CanvasEntry[] = [
  preview({
    id: "spring-button",
    name: "Button · primary and secondary",
    component: PrimaryButton,
    props: { primary: "Save changes", secondary: "Cancel" },
    x: -140,
    y: -80,
    width: 280,
    height: 160,
  }),
  preview({
    id: "status-banners",
    name: "Banner · statuses",
    component: StatusBanners,
    props: {},
    x: 180,
    y: -80,
    width: 440,
    height: 428,
  }),
  preview({
    id: "badge-colors",
    name: "Badge · colors",
    component: BadgeColors,
    props: {},
    x: -560,
    y: -80,
    width: 380,
    height: 216,
  }),
];
