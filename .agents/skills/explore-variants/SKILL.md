---
name: explore-variants
description: Build three alternatives of one ui-lab element as canvas items, so the owner can compare and pick one.
disable-model-invocation: true
---

# Explore variants

Each variant is a different answer to one brief. They sit side by side on the canvas, the owner picks, and the rest get deleted. This skill produces candidates and never ranks them.

## 1. Scope one piece

One element per run. If the request spans several, list them and ask which one. Restate the brief in one sentence: what it is, and what it has to do.

## 2. Name the axis

Choose one axis, and give each variant a different position on it. Everything else follows from that position and stays alike, so a difference on the canvas means something.

| Axis      | What varies                           | Judged with     |
| --------- | ------------------------------------- | --------------- |
| Structure | Grouping, order, what collapses       | `craft-element` |
| Density   | Spacing, how much fits                | `craft-details` |
| Emphasis  | Where filled color goes, what recedes | `craft-color`   |
| Type      | Scale steps, weight contrast          | `craft-details` |
| Voice     | Labels, tone, how much copy           | `craft-element` |
| Motion    | What moves, how far, how expressive   | `craft-motion`  |

Default to three variants, and go to five only when asked. Write the set down first, with a name and an axis position each. Names say what the direction is, such as `Quiet`, `Editorial`, or `Dense`.

This step is done when no two variants share a position, and you can state each one's position in a phrase.

## 3. Build them as canvas items

Follow `craft-element` for each, and clear its floor. A direction that can only work by breaking the floor gets dropped, with the reason stated.

- **One file per variant:** `src/canvas/previews/<id>-<variant>.tsx`, sharing parts through imports.
- **One registry entry per variant,** named `<Element> · <Variant>`, with its own ID and independent state.
- **Same data in all of them:** realistic content in realistic amounts, at the intended size. Three rows and "Jane Doe" flatter every structure.
- **Placed in a row,** in nearby empty space, without moving existing items.

## 4. Present the tradeoffs and stop

Open the canvas once and operate every variant. Confirm that each renders, responds, and logs no console errors. Then hand over the decision:

| Variant | Axis position        | Right when        | Costs           |
| ------- | -------------------- | ----------------- | --------------- |
| Quiet   | Lowest visual weight | It's used all day | Least memorable |

Mark no favorite in the table. If the owner asks directly, answer from how often the piece is seen and what it's for.

## 5. Promote one, delete the rest

On a choice, fold it into the element's real file and entry, then delete the other variants and their entries. Search for their names and check the diff. Keep shared parts only if the winner uses them.

If the owner asks for another round, keep the items and return to step 2 with new positions around the direction they leaned toward.
