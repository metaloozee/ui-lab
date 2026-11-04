---
version: alpha
name: ui-lab
description: A personal scratchpad for crafting complex interface elements over one design and motion system, on a blank infinite canvas.
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

ui-lab is a personal scratchpad for crafting complex interface elements and screens, such as meshes, one-time-code inputs, forms, and steppers. A blank infinite canvas, in the spirit of Excalidraw and tldraw, makes them live. Each one is built from scratch over the system described here, then handed to other workspaces as a prompt. The direction is minimal: neutral greys carry the interface, and one accent, chosen from the toolbar, carries emphasis. Components and motion build on the Fluid Functionalism registry, whose copies here are owned and edited locally.

## Source files

Code named in this file lives in the ui-lab repo. Every `src/` and `lint/` path here is relative to `https://raw.githubusercontent.com/metaloozee/ui-lab/main/`, so `src/lib/springs.ts` is at `https://raw.githubusercontent.com/metaloozee/ui-lab/main/src/lib/springs.ts`.

When you work in another workspace, resolve each name in this order:

1. If the workspace already has it, use that.
2. If it doesn't, read the file below and rebuild it for that workspace, keeping its behavior and values exact.
3. If the file can't be reached, rebuild it yourself from what this document says about it.

| Name                                               | File                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Color tokens, `--spring-fast`, `--spring-moderate` | `src/index.css`                                                               |
| `spring`, `DEFAULT_MOTION`                         | `src/lib/springs.ts`                                                          |
| `pressMotion()`                                    | `src/lib/press.ts`                                                            |
| Text weights                                       | `src/lib/font-weight.ts`                                                      |
| `typeClass()`                                      | `src/lib/type-scale.ts`                                                       |
| `useSize()`                                        | `src/lib/size-context.tsx`                                                    |
| `useShape()`, `nestedRadius()`                     | `src/lib/shape-context.tsx`                                                   |
| `useIcons()`                                       | `src/lib/icon-context.tsx`                                                    |
| Icon roles                                         | `src/lib/icons.ts`                                                            |
| `MotionConfig` and the providers around every view | `src/lib/fluid-provider.tsx`                                                  |
| `useFluidHover`                                    | `src/hooks/use-fluid-hover.ts`                                                |
| `FluidHoverHighlight`                              | `src/components/fluid-hover-highlight.tsx`                                    |
| `useSelfFluidHover`                                | `src/components/self-fluid-hover.tsx`                                         |
| `useMorphFromAnchor`                               | `src/hooks/use-morph-from-anchor.ts`                                          |
| `useSurfaceMorph`                                  | `src/hooks/use-surface-morph.ts`                                              |
| `Button`                                           | `src/components/ui/button.tsx`                                                |
| Other controls                                     | `src/components/ui/{badge,banner,scroll-area,slider,switch,tabs,tooltip}.tsx` |
| The rules `vp check` enforces                      | `lint/design-tokens.js`                                                       |

`MotionConfig` and `useReducedMotionConfig()` come from `motion/react`. Package versions are in `package.json` at the same address. The `@fluid` registry is `https://www.fluidfunctionalism.com/r/{name}.json`.

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

Text comes from six roles, each a size and a line height in px. Read them through `useSize().type` or `typeClass()`, so they follow the Size setting.

| Role     | Regular | Compact | Used for                              |
| -------- | ------- | ------- | ------------------------------------- |
| display  | 28 / 34 | 24 / 30 | Page titles                           |
| title    | 16 / 22 | 15 / 20 | Section headings, dialog titles       |
| subtitle | 14 / 20 | 13 / 18 | Card titles, emphasized rows          |
| body     | 13 / 20 | 12 / 18 | Control labels and body copy          |
| caption  | 12 / 16 | 11 / 14 | Descriptions, meta rows, group labels |
| micro    | 11 / 14 | 10 / 12 | Keyboard caps and counters, one line  |

Text uses three weights from `src/lib/font-weight.ts`: 400 for text, 550 for headings and selected items, and 700 for display only. Change weight through `fontVariationSettings`, never `font-weight`, so labels get heavier without moving their neighbors. Text that changes weight on a state change reserves its width with an invisible copy at the heavier weight.

An editable field reads `useSize().field`, which goes to 16px on touch screens so iOS doesn't zoom into it.

## Shapes

Read corner radii from `useShape()` rather than writing them by hand, so components follow the Corners setting.

| Role                           | Rounded | Pill | Read as                         |
| ------------------------------ | ------- | ---- | ------------------------------- |
| Controls, rows, selection fill | 8px     | 20px | `bg`, `button`, `input`, `item` |
| Focus ring                     | 10px    | 22px | `focusRing`                     |
| Merged selection               | 8px     | 16px | `mergedBg`                      |
| Containers and popups          | 12px    | 24px | `container`, `containerRadius`  |

Nested corners are concentric: inner radius = outer radius − inset − border. The shipped pair assumes a 4px inset, which is why a container pads its rows by 4px (12 − 4 = 8, 24 − 4 = 20). For any other inset, use `nestedRadius()`.

## Sizes

Every control and list row sits on one of two heights, read from `useSize()`, so a row in a popup lines up with the control that opened it.

| Value          | Regular | Compact |
| -------------- | ------- | ------- |
| Control height | 36px    | 28px    |
| Icon           | 16px    | 14px    |
| Body text      | 13px    | 12px    |
| Control gap    | 8px     | 4px     |

A row of text lands on the ladder through its line box: 8 + 20 + 8 = 36, and 5 + 18 + 5 = 28.

## Layout

The canvas fills the viewport with a plain background and one fixed toolbar.

The toolbar holds search, zoom, fit, Theme, Accent, and Inspect. Clicking the zoom readout resets the camera. Inspect holds Feel, Speed, Corners, Size, and fine-tuning behind a disclosure.

The toolbar and its panels are one surface pinned to the bottom-left corner, and it grows up and to the right. It morphs straight from one panel to another.

- **Inspect:** Zoom gives way to the settings, while Theme, Accent, and the Inspect button stay together in the bottom row and ride the surface's corner, so the theme and accent can change while a setting is being judged. "Fine-tune springs" takes zoom's place and steps aside while a picker needs the row. The Inspect button or Escape turns the panel back into the toolbar. The panel stays open while you work on the canvas, so a setting can be felt on real items, and canvas shortcuts still apply.
- **Search:** Ctrl or Cmd + K, or the search button, keeps the search glyph in place under the cursor and turns the rest of the bottom row into the field. Results rise above it, with the first result beside the field, so Up walks away from it and Down walks back. Every query word must match an item's name or purpose, and rows keep registry order so they never move under the cursor. Enter or a click flies the camera to that item. Escape, the shortcut, the search button, or a click outside closes it.

Each preview renders at the dimensions set in its registry entry. Do not stretch content to fill a frame.

An item's readable name sits above its preview with the move handle beside it. Clicking the name copies a prompt for rebuilding the component in another workspace: its purpose, the system sections of this file, and its complete source with everything it imports. Its hint appears on hover and keyboard focus.

Items never rest overlapping, and items already overlapping are separated on load. While carried, an item may pass over anything. Where it will settle clears every neighbor and lines up with nearby neighbors' edges, centers, and the standard gap, with a guide line showing the alignment. A neutral landing slot appears only when that spot is away from the pointer. The item pulls onto that spot once it is close, using the values in `src/canvas/controller.ts`. Hold Ctrl or Cmd to carry without alignment, and press Escape to put the item back.

Dragging has three phases: pick up lifts the frame and label as one object, carry follows the pointer exactly, and drop springs into a clear spot with the release's momentum. A carried item stays attached to the pointer whatever the Feel and Speed settings are, so its physics use fixed rates in `src/canvas/item-motion.ts`. The drop uses real springs and follows them.

Move handles show a grab cursor, and any drag shows a grabbing cursor. Empty canvas keeps the default cursor at rest, and it never takes focus: canvas keyboard shortcuts apply whenever no control has focus. Controls inside a preview keep their native cursors.

## Elevation & Depth

Nesting reads from shade, with a faint `border-default` edge. Reserve `shadow-surface-*` for floating layers.

## Components

Build controls from `src/components/ui`, which uses the Base UI flavor of the registry. Install more with `vp dlx shadcn@latest add @fluid/base/<name>`, or `@fluid/<name>` for items with one source, then rename its tokens to the roles in `src/index.css`.

Read icons by role with `useIcons()`, and change one by overriding its role in `src/lib/icons.ts`. HugeIcons is the base and Untitled UI provides overrides. Use free variants only.

## Motion

Motion shows what changed. Everything moves on three spring tiers in `src/lib/springs.ts`, chosen by the size of what moves: the bigger the thing, the slower the spring.

| Tier              | Label in Inspect | Time  | Bounce | Exit  | Used for                                            |
| ----------------- | ---------------- | ----- | ------ | ----- | --------------------------------------------------- |
| `spring.fast`     | Small moves      | 0.08s | 0      | 0.06s | Hover, focus, press, tooltips, selection indicators |
| `spring.moderate` | Medium moves     | 0.16s | 0      | 0.12s | Short travel, small expansion, and exact landings   |
| `spring.slow`     | Large moves      | 0.24s | 0.12   | 0.16s | Large surfaces: dialogs, side panels, morphs        |

- **Entrances are springs, and exits are tweens.** A spring reverses from wherever it is when interrupted. An exit uses its tier's `.exit` duration, so a dismissal reads crisp instead of replaying the entrance.
- **An appear outlasts a disappear.** What leaves goes first, and what arrives waits until there's room for it.
- **Tokens are read when an animation starts.** Inspect writes to `spring` directly, so its settings retune everything without a rerender. Never hand-write a duration in canvas interface motion. Experiments start from the tokens and may choose their own timing on purpose.
- **Inspect's Feel and Speed:** Feel swaps all three tiers between presets, and Speed divides every duration (1×, ½×, ¼×). `DEFAULT_MOTION` holds the defaults, and `src/canvas/inspector/feel.ts` holds Snappy and Slow.
- **The few CSS transitions** read `--spring-fast` and `--spring-moderate`, which follow the same settings.
- **Move with `transform` and `opacity`.** That stays on the compositor, and `MotionConfig` reduces it for free. Where width or height has to animate, such as a picker or a disclosure, gate it on `useReducedMotionConfig()` and snap under reduced motion.
- **Reduced motion means fewer and gentler, not none.** Travel and scale drop, and fades stay. Inspect can force it on or off.

### Morphs

A surface never appears from nothing, and a fade supports motion rather than being the whole animation.

- **A popover** grows out of its trigger and collapses back through `useMorphFromAnchor`. It moves and clips the real surface, so its contents never stretch.
- **A toolbar that becomes a larger surface** resizes that one surface through `useSurfaceMorph`, so its shadow and corners stay real. Each morph starts from where the surface is right now, so an interrupted one turns around without a jump. Leaving content fades out in the first 35% of the morph. Arriving content waits until 35% and finishes by 80%. Whatever shows on both sides of a morph never dips.
- **Controls that slide under a resting cursor** ignore the pointer until it moves, so nothing lights up or takes a click it wasn't aimed at.
- **A height that follows content** springs on `spring.moderate`, and only when that element itself changed. Stacked measured-height animations chase each other and land late.
- **Slow content mounts ahead of time,** hidden, rather than on the click that reveals it. A spring's clock runs through any freeze, so the move would otherwise happen unseen.

## Interaction

**Hover:** Every hoverable element uses `useFluidHover` and `FluidHoverHighlight`, or `useSelfFluidHover` when it stands alone. One highlight per group glides between touching items on `spring.fast`. A divider between different kinds of controls starts a new group.

**Press:** Every interactive element animates when pressed, through `Button` or `pressMotion()` from `src/lib/press.ts`. The smaller the target, the deeper the press.

| Target                      | Scale |
| --------------------------- | ----- |
| Move handle                 | 0.85  |
| Toolbar button              | 0.86  |
| Small icon button           | 0.88  |
| Default, `pressMotion()`    | 0.92  |
| `Button` label, text button | 0.96  |
| Full-width row, disclosure  | 0.98  |

**Selection:** A selected option is marked by a pill that travels to it, with unselected options dimmed. Selected fills use `bg-active`.

**Lists with a text field:** The field keeps focus and points at the highlighted row through `aria-activedescendant`. The fluid hover fill is the only highlight. The pointer moves it through `useFluidHover`, the keyboard through `setActiveIndex`, and the list scrolls on the same spring so row and fill travel together.

**State changes:** Animate copied, selected, and reset as well. Two icons swap in one cell, crossfading with a touch of blur and scale, so the slot never resizes. A label that changes keeps a stable accessible name and announces through a polite live region.

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
