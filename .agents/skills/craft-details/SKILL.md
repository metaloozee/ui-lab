---
name: craft-details
description: Refine the details of ui-lab elements, from type and text behavior to icons, corners, spacing, and optical balance. Use when setting any of those, or when something looks slightly off.
---

# Craft details

The owner reviews every detail, and most details here have one right answer. `DESIGN.md` holds the values: its **Typography**, **Shapes**, **Sizes**, and **Elevation & Depth** sections. This skill holds the judgment around them. Read the sections you're touching first, then the matching part below. Color belongs to `craft-color`, and motion to `craft-motion`.

Exact values stay exact: read them from `useSize()`, `useShape()`, and `fontWeights`. Optical nudges are starting points, judged by eye at real size.

## Type

**Pick a role by purpose,** then check its compact step. `DESIGN.md` says what each role is for. A label that must stay readable at both steps may need a different role, not a smaller one. `micro` stays on one line.

**Hierarchy comes from size and weight.** Three weights and two text colors do the work: `text-primary` and `text-secondary`, with `text-disabled` for disabled controls only. A subordinate heading never outweighs its parent.

**Weight goes through `fontVariationSettings`,** with the `fontWeights` tokens. They pair weight with optical size, so a label holds its width when it gets heavier.

**Set line height through the role.** To override one, put the `leading-*` after `typeClass()` inside `cn()`.

**Text that wraps gets room.** Three or more lines need a line height of at least 1.4. Reading text caps at 60–75 characters per line.

**Choose how text behaves when it doesn't fit:**

| Situation                          | Use                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Headings and short descriptions    | `text-wrap: balance`                                                                       |
| Paragraphs                         | `text-wrap: pretty`, except text that streams in, since it re-wraps earlier lines          |
| Labels, badges, single-line values | `whitespace-nowrap`                                                                        |
| URLs, IDs, user-written strings    | `overflow-wrap: break-word`                                                                |
| Truncation                         | `truncate` or `line-clamp-*`, always with a way to reach the full value, such as a tooltip |

**Numbers that change** take `tabular-nums`: timers, counters, one-time codes, table columns, and live values. A value that changes width also reserves its widest form with an invisible copy in the same cell.

**Text boxes:** in badges and tight controls, `text-box: trim-both cap alphabetic` centers the letters. Trim invisible copies too, and trim a flex row's parts rather than the flex container.

**Editable fields** read `useSize().field`, which keeps iOS from zooming. For a one-time code or other centered input, keep that size on touch and adjust the box around it. Style the placeholder and `caret-color` with tokens.

**Rendered copy** uses real punctuation: curly quotes, `…`, en dashes in ranges, and a non-breaking space in `10 km`. Code keeps straight quotes. Store text in natural case, with sentence case labels.

**Selection stays on.** `select-none` belongs only on drag and gesture surfaces.

**Mixed direction:** wrap names, numbers, and URLs in `<bdi>` when they sit inside text of another direction, and use `text-align: start`.

## Icons

**Read icons by role** with `useIcons()`, and size them from `useSize().icon`. A new role goes in `src/lib/icons.ts`, free variants only.

**Judge neighbors as a set.** Icons in one row come from one family and read at one visual size, which isn't always one number. The toolbar draws its crescent a pixel smaller than its sun, because a moon carries more mass. Check every icon at its real render size.

**Stroke follows the text beside it:** about 1.5px beside regular text and 2px beside semibold. Icon strokes scale with the drawing, so check the rendered stroke rather than the prop.

**One drawing, recolored by state.** Icons use `currentColor`. Where a set has both forms, outline is the default and fill marks active.

**On hover, a stroke can thicken** from 1.5 to 2 rather than the label changing weight.

**Under RTL,** mirror icons tied to reading direction: back and forward, chevrons, and list and indent glyphs. Leave logos, checkmarks, clocks, and media controls alone.

## Corners

**Read radii from `useShape()`,** so they follow the Corners setting. Popups may keep the rounded pair in Pill mode, since a heavy pill distorts padding at that scale.

**Nested corners are concentric** when one surface sits close inside another. The shipped pair assumes a 4px inset. For any other inset, use `nestedRadius()`. Past 24px of inset, or with uneven gaps, treat the layers as separate and tune by eye. A row of cells inside a container follows the same rule at the row's first and last cell.

## Size and spacing

**Every control and row sits on the ladder.** A row reaches its height through padding plus its line box, and a popup row matches the control that opened it. Density is a region's decision, so wrap a region in one `SizeProvider` rather than sizing each control.

**Spacing comes from a role.** `useSize().gap` sets control spacing, and a container pads its rows by 4px.

**Keep layout on whole pixels.** A fractional height pushes every overlay below it off by a fraction, so round it.

**Reserve space for what comes and goes:** validation text, counters, spinners, checkmarks, and hover-revealed actions. Nothing moves when they appear. Keep a loading control's label mounted at opacity 0, so its width holds.

**Hit areas can outgrow visuals.** Extend a small target with padding or a pseudo-element, and make touching targets share an edge, with no dead gap between them.

## Optical balance

Geometry is where you start, and the eye decides. Check these at 100% and in both themes:

- **A button with an icon** starts with about 2px less padding on the icon side.
- **A play triangle** shifts toward its point.
- **Asymmetric glyphs** such as stars and carets are best fixed in the drawing, or else with a wrapper nudge.
- **Neighboring elements** read at one visual height: a filled swatch looks larger than an outline at the same size.
- **Fill edges** line up with the label's axis, so rows, fields, and headings share one text start.
- **Text in a filled pill** often sits low, which `text-box` trimming fixes.

## Surfaces

**Nesting reads from shade** with a faint `border-default` edge. Shadows belong to floating layers. A form field keeps its visible boundary.

**Content images** get a 1px outline inset by 1px, in pure black at 10% on light and pure white at 10% on dark. A tinted outline shows as a colored fringe. Those values need the raw-color lint exception. Skip transparent artwork.

**Scrollable overlays** take `overscroll-behavior: contain`, so scrolling past the end never moves the canvas. Show that more is there, with `scroll-fade` on the viewport, so a cut-off row reads as scrollable.

**Hover shapes** you set by hand check for a mouse pointer, so touch never leaves them stuck. A control that draws its own pressed state sets `-webkit-tap-highlight-color: transparent`.

## Before you finish

| Pattern                                            | Fix                                               |
| -------------------------------------------------- | ------------------------------------------------- |
| `text-[13px]`, or `font-medium` and friends        | `typeClass()`, `useSize().type`, or `fontWeights` |
| `uppercase` or `tracking-*` on labels              | Size and weight carry hierarchy                   |
| `opacity-*` on text to make it quieter             | `text-secondary`                                  |
| A padded parent and child with one radius          | `nestedRadius()`                                  |
| `rounded-*` written directly on a control          | `useShape()`                                      |
| A number that changes with no `tabular-nums`       | Add it                                            |
| `truncate` with no way to the full value           | Add a tooltip or an expanded state                |
| `...` or `--` in rendered text                     | `…` or a dash                                     |
| A row height from a hard-coded `h-*`               | `useSize().control`, or padding plus the line box |
| A value appearing that shifts its neighbors        | Reserve the slot                                  |
| An icon size written as a number beside controls   | `useSize().icon`                                  |
| A scrollable overlay with no `overscroll-behavior` | `overscroll-behavior: contain`                    |
