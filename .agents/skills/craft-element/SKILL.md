---
name: craft-element
description: Build an interface element in ui-lab from source code, snapshots, a drawing, or a fuzzy idea. Use when a component arrives, or when an element's states, structure, or variants change.
---

# Craft an element

An element here is complex by nature, such as a mesh, a one-time-code input, a form, or a stepper. Generic pieces stay in `src/components/ui`, off the canvas. Read `DESIGN.md` first. Whatever arrives, the result is written from scratch against this system.

## 1. Read what arrived

- **Source code:** treat it as a behavior spec, and take nothing but behavior from it. List its states and interactions, then close the file while you write.
- **Snapshots and a description:** reverse engineer it, and list the behaviors you inferred rather than saw, so the owner can correct them.
- **A drawing or a fuzzy explanation:** read the `grilling` skill and interview relentlessly before any production code, until every state, transition, and edge case has an answer from the owner.

This step is done when you can describe what the element is for and how it behaves in two sentences. That text becomes its `purpose`.

## 2. Map it

Write this down before building, and show it to the owner when the source was anything but code:

- **Anatomy:** the parts, and which are interactive.
- **States:** rest, hover, focus, pressed, selected, disabled, loading, empty, error, success, and any of its own. Drop only the ones that can't happen. For each, note what shows and what changed.
- **Transitions:** what moves between states, and what the user can do mid-move.
- **Input:** pointer, keyboard, and touch. [interactions.md](interactions.md) holds tested behavior for fields, lists, menus, dates, sliders, steps, and more, so read the sections that apply.
- **Content limits:** the longest, shortest, and empty values, and how many items.

This step is done when every state has an answer, or is listed as a question for the owner.

## 3. Decide its variants

Variants are few, and each one earns its place:

| The difference                               | Make it                                                    |
| -------------------------------------------- | ---------------------------------------------------------- |
| Density or corner shape                      | Nothing new: `useSize()` and `useShape()` already cover it |
| Accent or theme                              | Nothing new: tokens follow them                            |
| One visual dimension, with the same behavior | A prop with named values, such as `tone` or `layout`       |
| Different states or a different input model  | A separate element, sharing parts                          |
| An open design question                      | `/explore-variants`, which the owner starts                |

Name a prop's values by what they mean, and give each a single default. A boolean that can conflict with another boolean wants to be one named prop.

## 4. Find what already exists

Check `src/components/ui`, then [registry.md](registry.md). Compose those where they fit, and read their source first, because they already handle things like press geometry and selection. Anything the element's behavior depends on, write yourself.

## 5. Build it

Create `src/canvas/previews/<id>.tsx` and one entry in `src/canvas/registry.tsx`, using `preview()`:

- **`id`** stays stable, so saved positions survive a rename.
- **`name`** is readable and unique, such as `Stepper · compact`.
- **`purpose`** opens the prompt another agent receives. State what it's for and how it behaves.
- **`source`** is the root-relative path of the file. The copied prompt follows its imports, so keep every part reachable from there.
- **`width` and `height`** are its intended size, since a preview never stretches to fill a frame.
- **`x` and `y`** sit in empty space, clear of other items.
- **`props`** are synthetic. Previews reach no real services, and use no personal data.

Read each of these before writing that part: `craft-motion` for anything that animates, `craft-color` for any color, and `craft-details` for type, icons, corners, and spacing.

Then the rules from `AGENTS.md` apply to every part: fluid hover, press, tokens, and `useIcons()`.

**On the canvas,** previews sit under the camera's transform. Keep portals in their native roots at screen size, and use public container APIs if alignment needs help. Preserve typing, selection, focus, nested scrolling, and touch inside the preview. Measure with `offsetWidth` and `offsetHeight`, since `getBoundingClientRect` reads the zoomed size.

## 6. Clear the floor

Every element and variant clears these, and none of them trades against a design direction:

- Every control has an accessible name and a visible focus indicator.
- The keyboard reaches everything a pointer does, in a sensible order.
- Motion respects reduced motion, and no state change rides on motion alone.
- Nothing clips, overlaps, or becomes unreachable at 320px wide or 200% zoom.
- Text and control pairs pass their contrast, measured.
- No meaning rides on color alone.
- A destructive action has a confirmation, an undo, or a distinct treatment.
- Truncated content has a way to the full value.
- Nothing hides past a scroll edge with no visible cue.
- Every error says how to recover.
- Status changes reach screen readers through a polite live region, and errors through `role="alert"`.

## 7. See it

Done means seen. Run the dev server, then:

- Hover, press, and drag every part, in both themes.
- Tab through it, and operate it with only the keyboard.
- Switch Corners, Size, and Accent in Inspect, and try reduced motion.
- Zoom the canvas in and out, and check any popup.
- Sample its motion, as in `craft-motion`.
- Click its name and read the copied prompt, to confirm its purpose and source came through.
- Run `vp check` and `vp test`.

Report what you built, what you inferred, and what you couldn't judge.
