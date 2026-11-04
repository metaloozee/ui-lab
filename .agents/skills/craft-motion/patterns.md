# Motion patterns

Find the state change, then use its mechanism. Lab hooks live in `src/hooks` and `src/components`. Patterns marked _registry_ were observed in Fluid Functionalism components and aren't all installed here, so treat their values as a tested starting point and judge them on the canvas.

## Hover

`useFluidHover` with `FluidHoverHighlight`, or `useSelfFluidHover` for a lone control. `DESIGN.md` holds the rules, and these are what its rules imply:

- **Rows touch.** With no gap, the highlight glides between rows. A gap puts it out for the crossing, so `nearest: true` is the choice when a cursor in a gap should still land.
- **Only click targets register.** Lighting anything else promises a click with nowhere to land.
- **Skip fluid hover** when a wrong click would hurt, when only some items are clickable, when items sit in a lot of empty space, or when rows change place as you scroll.
- **Keep layout above the rows on whole pixels.** The highlight places itself from `offsetTop`, which rounds, so a fractional height above sets it off by a fraction on every row below.
- **A mask, clip-path, or filter wrapper** paints as one block, so render the highlight inside that wrapper.
- **Touch** has no hover state to leave behind. Check `pointerType === "mouse"` before setting a hover shape by hand.

## Press

`Button` or `pressMotion()`, scaled by the table in `DESIGN.md`. A disabled control never presses.

_Registry:_ on a very wide control, a scale warps unevenly, so `Button` collapses a 1px spread on every side instead. Press fast, and release slower.

## Selection

- **One marker travels.** A single element springs on `spring.moderate` from the old choice to the new one, so the eye sees the choice move.
- **Dim the rest,** rather than adding a mark beside the selected option.
- **Weight changes without reflow.** Stack an invisible heavier copy in the same grid cell. Give that copy the same `text-box` trim as the visible label, or the cell grows and the label sits off-center.
- **Hover previews and selection commits.** Hover moves the highlight, and only the persistent state changes a label's weight.

_Registry:_

- **Adjacent selected rows merge** into one block. Give runs stable IDs, so a growing run morphs rather than exits and re-enters. A row that bridges two runs glides both inner edges to its midpoint on `spring.moderate`, which lands exactly, with the corners trailing.
- **Acknowledge a pick before closing.** Hold a popup about 300ms after a pick, so the choice is seen landing. Escape and outside presses still close at once.
- **Checks draw themselves.** Animate `pathLength` 0 to 1 at the fast tier's duration with `easeOut`, and retract faster with `easeIn`. Items already checked at mount skip the draw.
- **Move the thumb, not the box.** A switch thumb stretches a little on hover and more on press, and its outer edge stays pinned to the track end.

## Icon and label swaps

Two glyphs share one grid cell, and both stay mounted, so the slot never resizes. Build the transitions at render, so they follow Inspect:

```tsx
const SHOWN = { opacity: 1, scale: 1, filter: "blur(0px)" };
const HIDDEN = { opacity: 0, scale: 0.6, filter: "blur(4px)" };

const enter = { duration: spring.fast.duration, ease: "easeOut" };
const leave = { ...spring.fast.exit, ease: "easeIn" };
```

Both are tweens on purpose. A critically damped spring settles early and would let the disappear outlast the appear, and a spring can't drive a `filter` string.

Animate a swap when it's infrequent and meaningful: copy to copied, play to pause, loading to success. Keep tab icons, navigation icons, and actions revealed on row hover instant.

A label that swaps reserves its widest form with an invisible copy in the same cell. Key the visible copy and slide it through `AnimatePresence mode="popLayout"`, as `CopyableName` does in `src/canvas/canvas-item.tsx`. Key a success state by a counter when pressing again should replay it.

## Disclosure and height

- **Mount slow content ahead of time,** keeping it at height 0 and `inert` until opened. Mounted by the click, its freeze spends the spring unseen. `FineTune` in `src/canvas/inspector/inspector.tsx` is the worked example, including a negative margin that cancels the parent's gap while closed.
- **Measure and animate to pixels on anything the canvas scales,** on `spring.moderate`. `height: "auto"` reads the visual size, so under a scaled ancestor it overshoots and snaps back. Fixed overlays, which never scale, may use `"auto"`.
- **Use no bounce on pure height,** since overshoot reads as a glitch.
- **Spring only when this element toggled.** When a child's change moved the height, snap. Stacked measured heights chase each other and land late.
- **Let opacity run ahead of height,** so the body dissolves rather than being sliced by the clip edge.
- **Hide after the exit finishes.** Applying `hidden` at close freezes the exit in mid-flight, while skipping it leaves closed content in the accessibility tree.
- **A `0fr` to `1fr` grid row** needs no measuring and survives a scaled parent (_registry_). Clip on the grid container rather than the track.

## Surfaces

- **Popover:** `useMorphFromAnchor` grows it out of its trigger. It has no callers yet, so check it on the canvas before relying on it. It moves and clips the real surface, and its contents wait until there's room.
- **Toolbar into a panel:** `useSurfaceMorph`. See its doc comment for the required structure.
- **Dialog** (_registry_): `spring.slow` with a fade and a 0.97 scale, leaving on the exit tween. If you own the unmount, add a timeout at `exitFallbackMs()` from `src/lib/springs.ts`, because a throttled tab can stall the callback and strand an invisible overlay.
- **Tooltip** (_registry_): `spring.fast` with a 4px slide from its side. Neighboring triggers share a delay window, so moving between them shows the next tooltip at once.
- **Popup side** (_registry_): grow from the side actually resolved after collision flipping, not the side requested.

## Lists and fields

- **Rows never re-sort under the cursor** as a query grows. They filter in place.
- **Field and list:** the combobox pattern in `DESIGN.md`. Scroll with offsets at the moment a keyboard move is decided, on the same spring as the highlight. `scrollIntoView` can scroll the page too.
- **Added items** (_registry_): new rows enter, and earlier ones slide with `layout="position"`. Wrap the list in `AnimatePresence initial={false}`, so loaded history appears settled.
- **Chips slide, and the field snaps** (_registry_). `popLayout` lifts a leaving chip out of flow, so the field reflows at once. Animating the input itself reads as the placeholder sliding in.
- **Removing with space** (_registry_): drive the row's height and the content's scale and fade from one progress value, through `useTransform`. A change listener lags by a frame and cuts the content.

## Paged content

Steppers, carousels, and month views (_registry_: Calendar).

- **Direction carries meaning.** Forward leaves one way and arrives from the other, and going back reverses it.
- **Stack both panels in one grid cell,** so incoming content is measured where it lands.
- **Travel a fraction of the width** when one panel shows, and crossfade where the two meet. Travel the full distance when neighbors are visible, so they read as one strip.
- **Spring height** from a measured pixel value when pages differ. Under reduced motion, keep only the crossfade.

## Drag and gestures

- **Separate click from drag** with a 2–4px dead zone, using pointer capture so release works anywhere.
- **The pointer owns the element.** Track it with no spring, then hand the release velocity to a real spring. `src/canvas/item-motion.ts` is the worked example, with frame-rate-independent easing while carried.
- **Swallow the click after a drag,** clearing the flag on the next frame so a drag never double-toggles.
- **Claim the gesture narrowly.** Put `touch-none` on the handle, not the content.
- **A cancelled gesture** snaps back without committing. Clear held keys on blur and on hidden tabs.
- **Keep previews honest.** Commit only on release, and drag-back past a threshold undoes the preview.

## Keeping a slot stable

- **Loading:** keep the label and icons mounted at opacity 0, so width holds, and overlay the spinner.
- **Slow data** (_registry_): stack the skeleton and the content in one cell, so the space never blinks empty. Size the skeleton to match. Wait about 160ms before showing it, so fast data never flashes one.
- **Values that change:** use `tabular-nums`, and reserve the widest value with an invisible copy.
- **Reveal-on-hover controls** gate `pointer-events` with their opacity, so an invisible control can't swallow a tap.

## Loops and ambient motion

Run the clock on `requestAnimationFrame`, by elapsed time, and skip a stalled frame such as a background tab rather than counting it (_registry_: CarouselDots). Under reduced motion, stop the loop and show a static frame. Announce one static status for screen readers, with the moving display `aria-hidden`, so it doesn't re-announce.

## CSS transitions

Use them for the few cases that don't need springs, and read `--spring-fast` or `--spring-moderate` so they follow Inspect.

- **Name each property.** `transition-[scale,opacity]`, including `font-variation-settings` when weight changes, or the weight snaps.
- **`will-change`** only after you see first-frame stutter, naming the animated property. It also creates a stacking context and pins `position: fixed` descendants.
- **From `display: none`:** `@starting-style` supplies the first frame, and `transition-behavior: allow-discrete` keeps the element rendered through its exit.
- **Theme switch:** the lab has no suppression today. If color transitions smear on a switch, disable transitions for the flip, force a style flush, and restore after the next frame.
