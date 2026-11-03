---
version: alpha
name: ui-lab
description: A personal scratchpad where agents build interactive UI experiments on a blank infinite canvas.
colors:
  bg-page: oklch(0.931 0 0)
  bg-surface: oklch(0.964 0 0)
  bg-nested: oklch(1 0 0)
  bg-raised: oklch(1 0 0)
  bg-inverse: oklch(0.205 0 0)
  bg-selected: oklch(0.845 0 0)
  text-primary: oklch(0.205 0 0)
  text-secondary: oklch(0.517 0 0)
  text-disabled: oklch(0.72 0 0)
  text-inverse: oklch(0.985 0 0)
  border-subtle: oklch(0.931 0 0)
  border-default: oklch(0.888 0 0)
  border-strong: oklch(0.845 0 0)
  accent-solid: oklch(0.572 0.19 258)
  danger-solid: oklch(0.592 0.215 25)
  warning-solid: oklch(0.616 0.119 85)
  success-solid: oklch(0.552 0.104 165)
  info-solid: oklch(0.56 0.1 230)
typography:
  sans:
    fontFamily: Inter Variable
  mono:
    fontFamily: Geist Mono Variable
  display:
    fontFamily: Inter Variable
    fontSize: 28px
    lineHeight: 34px
  title:
    fontFamily: Inter Variable
    fontSize: 16px
    lineHeight: 22px
  subtitle:
    fontFamily: Inter Variable
    fontSize: 14px
    lineHeight: 20px
  body:
    fontFamily: Inter Variable
    fontSize: 13px
    lineHeight: 20px
  caption:
    fontFamily: Inter Variable
    fontSize: 12px
    lineHeight: 16px
  micro:
    fontFamily: Inter Variable
    fontSize: 11px
    lineHeight: 14px
rounded:
  control: 8px
  container: 12px
spacing:
  control: 36px
  control-compact: 28px
---

## Overview

ui-lab is a personal scratchpad for pushing UI elements and their interactions as far as they will go. Agents build interactive experiments in source, and a blank infinite canvas, in the spirit of Excalidraw and tldraw, makes them live. The direction is minimal: neutral greys carry the interface, and one accent, chosen from the toolbar, carries emphasis. Components and motion build on the Fluid Functionalism registry, whose copies here are owned and edited locally.

## Colors

Every color is an OKLCH token in `src/index.css`. Components use semantic tokens only, named by role, such as `bg-bg-surface` and `text-text-secondary`. Primitives such as `--neutral-900` and `--blue-600` stay inside the token file.

Nested objects never share their parent's fill. Each level uses the next shade of the same grey: `bg-page`, then `bg-surface`, then `bg-nested`. Floating layers such as menus use `bg-raised` with a `shadow-surface-*` elevation, because light mode has no lighter shade left after `bg-nested`.

The accent reaches every component through the `accent-*` tokens: primary button fills, focus rings, selection, and "on" states. Other buttons in the same view stay neutral. The toolbar sets the accent with `data-accent` on the root element, so never set an accent per component.

Status colors use the `danger-*`, `warning-*`, `success-*`, and `info-*` tokens. Each has `solid`, `solid-hover`, `subtle`, `border`, `text`, and `on-solid` roles. Pair status color with an icon or a label, so meaning never depends on color alone.

The `category-*` tokens are decorative labels for Badge. Text on them stays `text-primary`.

An experiment may set its own color only when color is its subject, with the exception declared by a lint-disable comment on that line. `vp check` rejects raw color values, palette classes, stock shadcn token names, and lucide imports everywhere else.

## Themes

Light values sit on `:root`, and dark applies through a `.dark` class on the root element, so it also reaches portaled layers. The theme control offers Light, Dark, and System, with System as the default.

| Token          | Light                  | Dark                  |
| -------------- | ---------------------- | --------------------- |
| bg-page        | oklch(0.931 0 0)       | oklch(0.168 0 0)      |
| bg-surface     | oklch(0.964 0 0)       | oklch(0.205 0 0)      |
| bg-nested      | oklch(1 0 0)           | oklch(0.248 0 0)      |
| bg-raised      | oklch(1 0 0)           | oklch(0.275 0 0)      |
| bg-inverse     | oklch(0.205 0 0)       | oklch(0.985 0 0)      |
| bg-selected    | oklch(0.845 0 0)       | oklch(0.42 0 0)       |
| text-primary   | oklch(0.205 0 0)       | oklch(0.985 0 0)      |
| text-secondary | oklch(0.517 0 0)       | oklch(0.66 0 0)       |
| text-disabled  | oklch(0.72 0 0)        | oklch(0.42 0 0)       |
| text-inverse   | oklch(0.985 0 0)       | oklch(0.205 0 0)      |
| border-subtle  | oklch(0.931 0 0)       | oklch(0.275 0 0)      |
| border-default | oklch(0.888 0 0)       | oklch(0.301 0 0)      |
| border-strong  | oklch(0.845 0 0)       | oklch(0.42 0 0)       |
| accent-solid   | oklch(0.572 0.19 258)  | oklch(0.74 0.105 258) |
| danger-solid   | oklch(0.592 0.215 25)  | oklch(0.74 0.123 25)  |
| warning-solid  | oklch(0.616 0.119 85)  | oklch(0.74 0.118 85)  |
| success-solid  | oklch(0.552 0.104 165) | oklch(0.74 0.121 165) |
| info-solid     | oklch(0.56 0.1 230)    | oklch(0.74 0.115 230) |

## Typography

Inter is the interface face, loaded with its optical size axis. Geist Mono is for code and fixed-width identifiers.

Change text weight through `fontVariationSettings` and the `fontWeights` tokens in `src/lib/font-weight.ts`, never through `font-weight`, so labels get heavier without moving their neighbors.

## Layout

The canvas fills the viewport with a plain background and one fixed toolbar.

The toolbar holds zoom, fit, Theme, Accent, and Inspect. Clicking the zoom readout resets the camera. Inspect holds Feel, Speed, Corners, Size, and fine-tuning behind a disclosure.

Each preview renders at the dimensions set in its registry entry. Do not stretch content to fill a frame.

An item's readable name sits above its preview with the move handle beside it. Items never rest overlapping, and items already overlapping are separated on load. While carried, an item may pass over anything. Where it will settle clears every neighbor and lines up with nearby neighbors' edges, centers, and the standard gap, with a guide line showing the alignment. A neutral landing slot appears only when that spot is away from the pointer. The item pulls onto that spot once it is close, using the values in `src/canvas/controller.ts`. Hold Ctrl or Cmd to carry without alignment, and press Escape to put the item back.

## Elevation & Depth

Nesting reads from shade, with a faint `border-default` edge. Reserve `shadow-surface-*` for floating layers.

## Shapes

Read corner radii from `useShape()` rather than writing them by hand, so components follow the Inspect panel's Corners setting. Use `nestedRadius` for a surface inset inside another rounded surface, so curves stay concentric.

## Components

Build controls from `src/components/ui`, which uses the Base UI flavor of the registry. Install more with `vp dlx shadcn@latest add @fluid/base/<name>`, or `@fluid/<name>` for items with one source, then rename its tokens to the roles in `src/index.css`.

Follow control sizes through `useSize()`, so components follow the Inspect panel's Size setting.

Read icons by role with `useIcons()`, and change one by overriding its role in `src/lib/icons.ts`. HugeIcons is the base and Untitled UI provides overrides. Use free variants only.

Every hoverable element uses `useFluidHover` and `FluidHoverHighlight`, or `useSelfFluidHover` when it stands alone, in experiments too.

Every interactive element animates when pressed, through `Button` or `pressMotion()` from `src/lib/press.ts`. Animate state changes such as copied, selected, and reset as well.

Canvas interface motion uses the `spring` tokens in `src/lib/springs.ts`, which the toolbar's Inspect panel tunes live. Experiments start from those tokens and may choose their own timing on purpose.

The item name is a button without button styling. Clicking it copies the name, and its hint appears on hover and keyboard focus.

Move handles show a grab cursor, and any drag shows a grabbing cursor. Empty canvas keeps the default cursor at rest, and it never takes focus: canvas keyboard shortcuts apply whenever no control has focus. Controls inside a preview keep their native cursors.

A selected option is marked by a pill that travels to it, with unselected options dimmed. Dragging has three phases: pick up lifts the frame and label as one object, carry follows the pointer exactly, and drop springs into a clear spot with the release's momentum. A carried item stays attached to the pointer whatever the Feel and Speed settings are.

A popover grows out of its trigger and collapses back into it through `useMorphFromAnchor`, rather than fading in place.

## Do's and Don'ts

- Don't give a nested object the same fill as its parent.
- Don't use raw color values or palette classes outside `src/index.css`, unless color is the experiment's subject and the exception is declared.
- Don't import lucide.
- Don't write hover fills by hand, such as `hover:bg-*` or `whileHover`.
- Don't use a plain `button` or `a` without a press animation.
- Don't hand-write a duration in canvas interface motion. `vp check` rejects it, and a deliberate exception needs a lint-disable comment that says why.
- Don't add decorative cards, banners, or background patterns to the workspace.
- Don't add a section, demo, or sample to explain a setting. The real canvas shows the effect.
- Don't let an item rest on top of another.
- Don't mark selection with a separate dot under a control.
- Don't use vague names or opaque IDs as item labels.
- Don't add a separate copy button or give the item name button styling.
- Don't apply cursor rules to all descendants of a preview.
