import type { ComponentType, ReactNode } from "react";

import { GitHubContributions } from "./previews/github-contributions";
import { OnboardingStepper } from "./previews/onboarding-stepper";
import { Wallet } from "./previews/wallet";

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
  preview({
    id: "wallet",
    name: "Wallet",
    purpose:
      "A wallet that rests as a slim stitched leather card holder with its cards stacked inside. Hovering or focusing it raises the cards so each can be told apart, and choosing one lifts that card out at full size while the rest tuck away and the holder recedes, until Escape, a click outside, or another click on the card returns it.",
    source: "/src/canvas/previews/wallet.tsx",
    width: 320,
    height: 380,
    x: -160,
    y: 170,
    component: Wallet,
    props: {
      cards: [
        {
          id: "graphite",
          issuer: "Graphite",
          tone: "graphite",
          lastFour: "7305",
          cardholder: "ayn.wtf",
          expiry: "03/30",
        },
        {
          id: "ultramarine",
          issuer: "Ultramarine",
          tone: "ultramarine",
          lastFour: "4821",
          cardholder: "ayn.wtf",
          expiry: "09/29",
        },
        {
          id: "forest",
          issuer: "Forest",
          tone: "forest",
          lastFour: "1964",
          cardholder: "ayn.wtf",
          expiry: "12/28",
        },
        {
          id: "terracotta",
          issuer: "Terracotta",
          tone: "terracotta",
          lastFour: "0572",
          cardholder: "ayn.wtf",
          expiry: "06/31",
        },
      ],
    },
  }),
  preview({
    id: "onboarding-stepper",
    name: "Onboarding stepper",
    purpose:
      "An onboarding flow that asks for a website, then competitors from a fixed list, then prompts to track, with simulated loading stages between screens and a success summary at the end. The site's favicon arrives as you type, becomes the loader, docks in the header, and returns for the payoff, while every keystroke and press gets its own small physical response; the domain fail.test makes each loader fail once so its recovery can be seen.",
    source: "/src/canvas/previews/onboarding-stepper.tsx",
    width: 480,
    height: 520,
    x: 220,
    y: 170,
    component: OnboardingStepper,
    // Real brands on request, so their favicons, and the one typed, come from Google's favicon service.
    props: {
      competitors: [
        { name: "Linear", domain: "linear.app" },
        { name: "Notion", domain: "notion.so" },
        { name: "Asana", domain: "asana.com" },
        { name: "Jira", domain: "atlassian.com" },
        { name: "Monday", domain: "monday.com" },
        { name: "ClickUp", domain: "clickup.com" },
        { name: "Trello", domain: "trello.com" },
        { name: "Basecamp", domain: "basecamp.com" },
      ],
    },
  }),
];
