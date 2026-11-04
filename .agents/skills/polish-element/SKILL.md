---
name: polish-element
description: Walk one ui-lab element or surface through every state in both themes, measure its motion, fix root causes, and report what only the owner can judge. Add a focus such as "motion" to narrow it.
disable-model-invocation: true
---

# Polish an element

This takes something that already works and finds what's still off. Everything here is seen and measured on the running page, because reading code misses what the owner notices first.

If a focus was given, such as `motion`, `color`, or `details`, walk only that part.

## 1. Inventory it

List its parts and every state each can reach, from the code. Anything you can't reach in the browser gets listed as not verified.

Read the checklists you'll hold it against: **Before you finish** in `craft-motion`, `craft-color`, and `craft-details`, and the floor in `craft-element`.

## 2. Walk it

Do each of these in both themes, and take a screenshot wherever something changes.

**Pointer:** hover across every neighbor and watch the highlight travel. Press and hold, then release. Drag, and cancel a drag. Leave and re-enter.

**Interruption:** press twice quickly, press Escape mid-move, and switch to another trigger mid-move. A slow Inspect Speed makes these easier to see.

**Keyboard:** tab through everything, operate it without a pointer, and check where focus lands after it closes.

**Settings:** Rounded and Pill, Regular and Compact, an accent and "No accent", and reduced motion.

**Canvas:** zoom in and out, and open any popup at each zoom.

**Width:** a narrow viewport, around 340px, and a short one, around 560px tall.

**First use:** reload, and do the very first interaction. Work that happens only once, such as mounting, shows up here and nowhere else.

## 3. Measure the motion

Sample each morph, disclosure, and move, as in `craft-motion`, including one interruption and one reduced-motion run. To follow a hover highlight, sample `[data-slot="fluid-hover-highlight"]`, with `--before 'hover:<first item>'` and `--action 'hover:<next item>'`.

Confirm any stall on a production build outside the repo before calling it real:

```bash
vp build --outDir <scratchpad directory>/prod --emptyOutDir
vp preview --outDir <scratchpad directory>/prod --port 4199 --strictPort
```

Then pass `--url http://localhost:4199` to the sampler.

## 4. Fix root causes

For each finding, find why it happens using `diagnosis.md` in `craft-motion`, then fix that. Before moving on, search for the same cause elsewhere and fix those too. Work from what breaks interaction, through what's visibly inconsistent, to isolated polish.

Change tokens, system rules, or shipped registry behavior only after asking the owner, because those affect everything.

Then re-measure, and re-walk whatever the fix touched.

## 5. Report

| Severity | Where             | Was                     | Now              | Why it mattered            |
| -------- | ----------------- | ----------------------- | ---------------- | -------------------------- |
| High     | `path/to/file:12` | 430px jump in one frame | Animates in full | The expansion never played |

- **High** breaks an interaction, or leaves a state unreachable or unreadable.
- **Medium** is a visible inconsistency.
- **Low** is isolated polish.

Add a **Your call** list for anything left unfixed that needs a decision, and a **Not verified** list for everything you couldn't run. You can't judge feel from numbers, so name the moments most worth the owner's eye. With nothing found, say so, and list what you checked.
