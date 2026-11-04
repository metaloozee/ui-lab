---
name: break-element
description: Render one ui-lab element under every worst case that can reach it, on a temporary canvas item, and report what visibly broke.
disable-model-invocation: true
---

# Break an element

This renders one element under every scenario that can really reach it. The temporary canvas item is half the report: scenarios stacked, with the breaks marked. It observes rather than judges, so a finding is something that visibly broke, and a predicted failure isn't one.

The run is build, look, report. It takes minutes, not a session.

## 1. Scope one element

One element per run. Restate it in one sentence: what it accepts, what it renders, and where it lives.

## 2. Choose the scenarios

Stress only what varies. Read its props, states, and data, then keep each axis below whose cue matches. Write the kept scenarios down, one line each, and name the axes you dropped and why, so a wrong inference is cheap to catch.

| Axis      | Cue                                       | Scenarios                                                                                    |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Length    | It renders text it doesn't author         | Empty, one word, typical, several sentences, one unbreakable 60-character string             |
| Shape     | Text can come from other users or locales | Emoji alone and mixed, RTL, mixed direction, diacritics and tall scripts, numbers in columns |
| Quantity  | It repeats over items                     | Zero, one, the realistic count, ten times that                                               |
| Container | Always                                    | 320px wide, squeezed by a flex sibling, very wide                                            |
| State     | It has the state                          | Loading, error, disabled, plus any of its own                                                |
| Input     | It accepts input                          | Pasted text, a value at each limit, an invalid value, rapid repeat presses                   |

## 3. Build the item

Create `src/canvas/previews/<id>-stress.tsx`, with one registry entry named `<Element> · stress`:

- **The real element,** imported and untouched. A rebuilt lookalike tests nothing.
- **One column,** with a short label above each scenario. Widths are fixed containers on the item.
- **Labels, widths, and fixture props are all it adds.** No styles of its own, and no simulated themes.
- **Synthetic data,** and no real services.

If a scenario is missing the content it was fed, the item is broken rather than the element, so fix the item first.

## 4. Look once

Load the canvas, skim every scenario top to bottom, and note what visibly broke: "Text escapes the field's right edge", not "spacing feels tight". Then add a one-line note under each broken scenario's label in a single edit, so the item reads as the report on its own.

Next, cycle the lab's settings over the same item: Light and Dark, Rounded and Pill, Regular and Compact, an accent and "No accent", and reduced motion. Those are viewing modes, so toggle them in the toolbar rather than simulating them.

With no browser at hand, say so and give the owner the scenario list. A report without a look has no findings.

## 5. Report and stop

| Scenario                            | Observed                                  | Fix with        |
| ----------------------------------- | ----------------------------------------- | --------------- |
| One unbreakable 60-character string | Overflows the card, no wrap or truncation | `craft-details` |

Broken scenarios go first. "Everything survived", plus the scenario list, is a complete report, with no suggestions added to pad it. Fix nothing unasked. On a request to fix, use the named skill, then re-render the scenario to confirm.

## 6. Leave it, delete it on request

Keep the item up until the owner says they're done. Then delete its file and entry, search for its name, and check the diff.
