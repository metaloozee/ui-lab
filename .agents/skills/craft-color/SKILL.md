---
name: craft-color
description: Choose and check colors in ui-lab, from semantic roles and nested shades to the accent, status colors, palettes for color-led elements, and contrast. Use before picking any color or changing a token.
---

# Craft color

Neutral greys carry the interface, and one accent carries emphasis. The **Colors** and **Themes** sections of `DESIGN.md` hold the rules and values, and `src/index.css` holds every token. Read them first. Every step below runs unless the element's color is its subject, which step 4 covers.

## 1. Name each color's job

For everything that takes a color, name its role before its value:

| Job                                   | Role                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| A surface, one level inside another   | The next of `bg-page`, `bg-surface`, `bg-nested`      |
| A floating layer                      | `bg-raised`, with a `shadow-surface-*` elevation      |
| Hover and selected fills              | `bg-hover` and `bg-active`, which work on any surface |
| Reading text, then quieter text       | `text-primary`, then `text-secondary`                 |
| A disabled control's text             | `text-disabled`                                       |
| An edge                               | `border-subtle`, `border-default`, or `border-strong` |
| The main action, focus, an "on" state | `accent-*`, with `text-on-accent` on a solid fill     |
| Danger, warning, success, info        | `danger-*`, `warning-*`, `success-*`, `info-*`        |
| A decorative label                    | `category-*`, with `text-primary` on it               |

This step is done when every color in the element has a role, or has been named as missing.

## 2. Keep meaning consistent

- **One color, one meaning, both ways.** If accent means interactive, a neutral interactive element is as misleading as an accent heading. Hues within about 15° of each other read as the same color.
- **One filled action per view.** Its peers stay neutral. Selection is state rather than emphasis, so an accent glyph on a selected option is fine beside a filled button.
- **Color backs up meaning.** Pair it with an icon, a label, or a shape, so state never rides on color alone.
- **Accent stays global.** It comes from `data-accent` on the root, and every accent, including "No accent", must work.
- **Status colors keep their meaning.** Danger marks danger, however good it looks elsewhere.

## 3. Add a missing role

Borrowing a token because its value looks right today breaks at the next change. A border used as text fades when borders get lighter. Instead:

1. Add a semantic token in `src/index.css`, named for its job, with a value in both themes.
2. Point it at a primitive where one fits. Components only ever reference the semantic name.
3. Add it to `DESIGN.md` if it's a role other elements will share.

Propose changes to existing tokens to the owner first, because they retune the whole system.

## 4. When color is the subject

A mesh, gradient, chart, or heatmap may set its own colors. Declare the exception with an oxlint-disable comment on that line, and read [palettes.md](palettes.md).

First decide whether the color should follow the system. An element that should feel native derives from `accent-*` through `color-mix(in oklab, …)`, so it follows the accent and theme. A fixed palette needs a value for each theme.

## 5. Measure

Measure every pair against the background it actually renders on, in both themes:

```bash
node .agents/skills/craft-color/scripts/color.mjs contrast '<foreground>' '<background>'
```

The script takes OKLCH and hex, and flattens a translucent foreground onto its background.

| Content                           | WCAG 2 | APCA                        |
| --------------------------------- | ------ | --------------------------- |
| Body text, in blocks              | 4.5:1  | Lc 75 (preferred 90)        |
| Labels and headings               | 4.5:1  | Lc 60                       |
| Large text: 24px, or 18.67px bold | 3:1    | Lc 45 at 36px, or 24px bold |
| Icons and component boundaries    | 3:1    | Lc 45 fine, Lc 30 solid     |
| Dividers and decoration           | none   | Lc 15                       |
| Disabled and placeholder text     | none   | Aim for Lc 30               |

Report WCAG with the APCA value beside it. Never report a value you didn't measure. `color-mix()`, opacity, and images resolve at render, so read the computed color from the browser. Over an image or gradient, measure the worst region or add a scrim.

**A failing pair inside an element:** choose a different role, and change lightness rather than hue. **A failing pair between system tokens:** report the pair, its value, and the threshold to the owner, and leave the tokens alone until they decide.

This step is done when every text, icon, and control pair is measured in both themes, and an accent-filled pair is measured across all accents.

## Before you finish

| Pattern                                                   | Fix                                             |
| --------------------------------------------------------- | ----------------------------------------------- |
| A nested surface with its parent's fill                   | The next shade                                  |
| A `border-*` token on text, or a `text-*` token as a fill | Add the missing role                            |
| A semantic name containing a hue, like `button-blue`      | Name it for its job                             |
| `text-white` or `text-black` on a fill                    | `text-on-accent` or the status `on-solid` token |
| An accent color set per component                         | `accent-*` tokens, which follow `data-accent`   |
| Text on a translucent fill, unmeasured                    | Measure the rendered pair                       |
| A color checked only in one theme                         | Check both                                      |
| A gradient with text on it                                | Measure the worst region, or add a scrim        |
| A raw color with no lint-disable reason                   | A token, or a declared exception                |
