---
name: craft-motion
description: Craft fluid motion in ui-lab, from springs and morphs to hover, press, drags, and state changes. Use before writing or changing anything that animates, and when motion feels wrong.
---

# Craft motion

Motion here is evidence: it shows what changed, where it came from, and where it went. The **Motion** and **Interaction** sections of `DESIGN.md` hold the tiers, press scales, and system rules. Read them first, since this skill builds on them without repeating them.

When existing motion feels wrong, start with [diagnosis.md](diagnosis.md), then finish at **See it**. Everything else runs in order.

## 1. Name the change

Write one sentence with the trigger, the two states, and how often it happens: "Clicking Inspect turns the toolbar into settings, a few times a session."

Frequency sets how much motion it earns. Keystrokes, row hovers, and tab switches stay near-instant. Expressive motion belongs to rare moments, such as a first load or a success state.

This step is done when you can say what the eye should follow from the first state to the second.

## 2. Choose the mechanism

Find the state change in [patterns.md](patterns.md) and use its hook or recipe. Whatever you choose:

- **One surface persists.** Resize, move, or clip the real element so its contents, shadow, and corners stay true. Scaling a surface stretches what's inside it.
- **One progress value drives one shape.** Derive every property from it, so parts can't drift apart.
- **Layout properties stay rare.** Prefer `transform` and `opacity`. Animate width or height only when the surface really changes size, and to a measured pixel value.

This step is done when each moving part has a named mechanism, and anything without a pattern has been proposed to the owner.

## 3. Assign tiers

The size of what moves picks the tier, and parts of one move share it. A carried item is the exception: while the pointer owns it, it follows exactly, with no spring.

Read tokens when an animation starts, inside render or an effect. Inspect rewrites `spring` in place, so `const enter = { duration: spring.fast.duration }` at module scope freezes the value and ignores Feel and Speed.

Experiments may choose their own timing when timing is the subject. Hoist the value into one named constant and declare the exception with a lint-disable comment that says why.

## 4. Sequence it

- What leaves goes first. What arrives waits until there's room. What shows on both sides holds still.
- Space opens before content appears. On the way back, content leaves before space closes.
- Move a parent or its children, one level per moment.
- Stagger only rare entrances, between siblings, at 0.04–0.1s, capped at 4 steps (8 for data rows), so a long list never queues.
- Put `initial={false}` on an `AnimatePresence` around a state swap, so the default state doesn't animate on mount. A real entrance keeps its `initial`.
- A dismissal is smaller than its arrival: a short drift and a fade. Travel the full distance only when the destination means something, such as a drawer closing.

## 5. Make it interruptible

Every morph starts from where things are right now, read at that moment. Springs and a shared progress value do this naturally, while CSS keyframes run a fixed timeline, so keep them for sequences that run once.

Walk these interruptions through the code:

- The same trigger pressed twice, quickly.
- Escape in mid-flight.
- A different trigger in mid-flight, such as one panel straight to another.
- The content or viewport changing during the move.

Stop the running animation in cleanup, and let the effect depend only on the state being animated.

Input follows the motion too. A surface that's mostly faded takes no clicks, and controls that slid under a resting cursor wait for a real pointer move.

## 6. Decide reduced motion

Keep the fades, and drop travel and scale. `MotionConfig` handles `transform` on motion components, and the rest is yours:

- **Width and height:** snap them with `useReducedMotionConfig()`.
- **`filter`:** a blur still runs under the config, so branch on it.
- **Loops and autoplay:** stop them, and show a static frame that carries the same meaning.

## 7. See it

Sample the real thing in both themes, including one interruption and one reduced-motion run:

```bash
node .agents/skills/craft-motion/scripts/sample-frames.mjs \
  --target '<surface selector>' \
  --action 'click:<trigger selector>' \
  --action 'click:<trigger selector>@80' \
  --shots 40,120,240 --out <scratchpad directory>
```

The dev server must be running. `--help` lists every option. Read the output for these:

| Output            | Healthy                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Largest step      | Proportional to the move. A large step in a normal frame is a jump                                                                           |
| Longest frame     | Near 17ms. A large step in or right after one is a stall, not a jump. Confirm a stall on a production build, since the dev build inflates it |
| Past the end      | On one move, this is overshoot: small, and only on `spring.slow`                                                                             |
| Direction changes | 0 on one move, and 1 per interruption. Anything more is a flash                                                                              |
| End box           | Equals the resting layout, with no snap after the last frame                                                                                 |
| Console errors    | None                                                                                                                                         |

Then hover, press, and drag it in both themes, and look at the screenshots. Numbers catch jumps and landings. They can't judge feel, so list what you couldn't judge for the owner.

This step is done when every interruption from step 5 has run or is listed as untested.

## Before you finish

| Pattern in the diff                                       | Fix                                                       |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `"auto"` as a motion target on anything the canvas scales | Measure `offsetHeight` or `offsetWidth` and animate to it |
| Slow content mounted by the click that animates it        | Mount it ahead of time, hidden, then animate              |
| `transition-all` or `transition: all`                     | Name the properties that change                           |
| `animation:` set on a toggled class or state              | A transition or spring, which can reverse                 |
| A `spring` value copied at module scope                   | Read it at render or when the animation starts            |
| `will-change` added without a seen stutter                | Delete it, or name only the animated property             |
| `filter` animated with no reduced-motion branch           | Branch on `useReducedMotionConfig()`                      |
| An exit that replays the entrance on the same spring      | The tier's `.exit` tween                                  |
