import type { ComponentType, ReactNode } from "react";

import { AsciiBento } from "./previews/ascii-bento";
import { GitHubContributions } from "./previews/github-contributions";
import { GridButtons } from "./previews/grid-button";
import { OnboardingStepper } from "./previews/onboarding-stepper";
import { PhotoDelete } from "./previews/photo-delete";
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
  preview({
    id: "ascii-bento",
    name: "ASCII bento",
    purpose:
      "A bento grid of three brand story cards, one tall beside two stacked, for GitHub, Vercel, and Linear. Each card is filled in its brand's color with a full-bleed field of ASCII glyphs that draws the brand's mark large, partly running off the card: dense glyphs inside, the outline traced in strokes that follow its direction, and a sparse scatter around it. Each mark is placed clear of the copy, and no glyph ever draws on the words. The brand's small mark and name sit at the top, a one-line story and a pressable link to the brand's About page at the bottom. The glyphs thin around the pointer, wider and deeper the faster it moves, and fill back in behind it; a click sends a ring of thinning outward from where it landed.",
    source: "/src/canvas/previews/ascii-bento.tsx",
    width: 640,
    height: 480,
    x: -840,
    y: 170,
    component: AsciiBento,
    props: {
      cards: [
        {
          id: "github",
          brand: "github",
          story: "Where over 100 million developers build software together.",
          mark: { x: 0.7, y: 0.34, size: 0.7 },
        },
        {
          id: "vercel",
          brand: "vercel",
          story: "Every push becomes a live preview.",
          mark: { x: 0.63, y: 0.628, size: 1.15 },
        },
        {
          id: "linear",
          brand: "linear",
          story: "Plan and ship product in one place.",
          mark: { x: 0.95, y: 0.52, size: 1.25 },
        },
      ],
    },
  }),
  preview({
    id: "photo-delete",
    name: "Photo delete",
    purpose:
      "A grid of six photos where each one's trash button widens into an inline Delete and Cancel confirmation. Confirming crumples the photo into a paper ball while a simulated request runs, a bin rises in the frame's bottom-right corner, and the ball is thrown along a real physics arc: a successful delete lands in the bin, sometimes off the rim, and the grid closes the gap, while a failed one (offline, timeout, server error, rate limit, or still syncing) misses, rests on the floor, flies back, smooths out, and stays in the grid marked “Not deleted”, ready to try again.",
    source: "/src/canvas/previews/photo-delete.tsx",
    width: 512,
    height: 372,
    x: 760,
    y: 170,
    component: PhotoDelete,
    props: {
      photos: [
        // Landscapes from Unsplash (unsplash.com/license), copied into public/photos.
        {
          id: "forest",
          name: "forest.jpg",
          size: "2.4 MB",
          src: "/photos/forest.jpg",
          alt: "A dirt path through a sunlit pine forest",
        },
        {
          id: "lake",
          name: "lake.jpg",
          size: "3.1 MB",
          src: "/photos/lake.jpg",
          alt: "A rowing boat on a turquoise lake below rocky peaks",
        },
        {
          id: "summit",
          name: "summit.jpg",
          size: "1.8 MB",
          src: "/photos/summit.jpg",
          alt: "Snowy peaks above a sea of clouds at sunset",
        },
        {
          id: "beach",
          name: "beach.jpg",
          size: "2.9 MB",
          src: "/photos/beach.jpg",
          alt: "Gentle waves on a sandy beach at sunrise",
        },
        {
          id: "milky-way",
          name: "milky-way.jpg",
          size: "4.2 MB",
          src: "/photos/milky-way.jpg",
          alt: "The Milky Way over snow-capped mountains",
        },
        {
          id: "meadow",
          name: "meadow.jpg",
          size: "2.2 MB",
          src: "/photos/meadow.jpg",
          alt: "A spiral of stones in a green valley at sunset",
        },
      ],
    },
  }),
  preview({
    id: "grid-button",
    name: "Grid button",
    purpose:
      "Buttons made like molded caps in three tones, primary in the accent, secondary in neutral, and destructive in the danger color with a trash icon, plus a square icon button. Each has a darker rim, a body lit from above, a bright inner bevel along its top edge, and a shadow in its own color, with a mosaic of small square tiles inside that lights up around the pointer, wider and brighter the faster it moves, and fades back behind it; a press sinks the cap, dims its bevel, and sends a ring of light outward from where it landed, or from the middle for a key press. The icon button's copy icon morphs into a check when pressed and back after a moment, announcing the change to screen readers. A loading button swaps its label for a spinner while a band of light sweeps the mosaic; a press can run a simulated load and return, or load and then show a check and its result with a ring of light before returning, and a disabled button dims and takes no input.",
    source: "/src/canvas/previews/grid-button.tsx",
    width: 360,
    height: 260,
    x: 480,
    y: -230,
    component: GridButtons,
    props: {
      rows: [
        [
          {
            kind: "text",
            id: "start",
            tone: "primary",
            label: "Get started",
            trailingIcon: "chevron-right",
          },
          { kind: "text", id: "docs", tone: "secondary", label: "View docs" },
        ],
        [
          {
            kind: "text",
            id: "delete",
            tone: "destructive",
            label: "Delete project",
            leadingIcon: "trash",
          },
          {
            kind: "icon",
            id: "copy",
            tone: "primary",
            icon: "copy",
            doneIcon: "check",
            label: "Copy prompt",
            doneLabel: "Copied",
          },
        ],
        [
          {
            kind: "text",
            id: "publishing",
            tone: "primary",
            label: "Publish",
            status: "loading",
          },
          { kind: "text", id: "refresh", tone: "secondary", label: "Refresh", flow: "load" },
        ],
        [
          {
            kind: "text",
            id: "save",
            tone: "primary",
            label: "Save changes",
            flow: "load-feedback",
            doneLabel: "Saved",
          },
          { kind: "text", id: "submit", tone: "primary", label: "Submit", disabled: true },
        ],
      ],
    },
  }),
];
