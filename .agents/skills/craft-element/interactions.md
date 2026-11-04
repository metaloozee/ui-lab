# Interaction behavior

Tested behavior by kind of element, distilled from the Fluid Functionalism registry's components. Read the sections that apply, and treat them as a spec to meet or a decision to make on purpose. Motion lives in `craft-motion`, and these sections cover input, focus, and state.

## All of them

- **One tab stop per group** with a roving tabindex: the selected item, or else the first. With neither, a group becomes unreachable.
- **Show the focus ring for keyboard focus only.** Chrome reports scripted focus as `:focus-visible`, so a mouse press that redirects focus can falsely light a ring. Track the input type where you redirect focus.
- **Move one ring between items,** instead of giving each item its own.
- **Inside a menu or list,** the highlight is the focus indicator, so it needs no ring as well.
- **Scope keyboard queries** to your own row elements. A hidden primitive with the same role would match too and land focus on something invisible.
- **Restore focus on purpose.** A closing surface returns focus to its trigger. A dismissed element hands focus to the next focusable thing, not the top of the page.
- **Mind IME composition:** ignore Enter and arrows while `isComposing`, so committing Japanese or Chinese input never submits.
- **Modifier keys keep their meaning.** Shift+Arrow still extends a selection, whatever plain arrows do.
- **Keep an accessible name stable,** and announce a state change through a polite live region.
- **Touch has no hover.** Anything revealed on hover stays visible on touch, detected with `(hover: none)`.

## Text fields and forms

- **Field states** form a ladder: disabled, then error, then focused, then hovered, then rest. Each shows one treatment.
- **A press anywhere in the field box** focuses the input. A press on the input itself is left alone, so caret placement still works.
- **The label** is tied with `htmlFor`, and an error's ID lands in `aria-describedby` with `aria-invalid` set. A visually hidden label still names an inline field.
- **Keep field height on the ladder,** including on touch, where the text grows to 16px inside the same box.
- **Fix one field width** when its contents change, with an invisible copy of the longest value in the same cell.
- **Errors** say how to recover, show after the first real attempt, and reserve their space.
- **Submitting** keeps the button's label mounted for width, disables a second submit, and moves focus to the first error on failure.

## One-time codes

Not in the registry, so these are decisions to confirm with the owner:

- **One real input,** drawn as cells, is the most robust: it supports `autocomplete="one-time-code"`, paste, undo, and screen readers. Separate inputs need all of that rebuilt.
- **`inputMode="numeric"`** for digit codes, and a `pattern` that matches.
- **Paste anywhere** fills from the start. Typing past the end does nothing, and a full code can submit by itself.
- **Backspace** on an empty cell moves back. Arrow keys and clicks move the caret between cells.
- **Errors** keep the digits, mark the cells, and put the caret where a fix can start.
- **Digits** take `tabular-nums`, and each cell stays one width.

## Text areas

- **Grow with content,** clamped between a minimum and maximum row count, and scroll only past the maximum. A near-zero-width mount can wrap into many lines, so re-measure on width change.
- **Enter sends, Shift+Enter makes a line,** when the area is a composer.
- **Arrow-driven extras,** such as history or suggestions, only take over when the caret is at the first or last line.
- **Suggestions are a listbox that never steals focus,** driven by `aria-activedescendant`.

## Lists with a text field

`DESIGN.md` holds the lab's pattern. Beyond it:

- **Press on a row is `preventDefault`ed,** so it never blurs the field.
- **Highlight the first row as soon as the list opens,** so Enter always has a target, and re-highlight it when the rows change. Compare by a joined key of values, so a new array with the same items doesn't reset it.
- **Keyboard moves scroll the row into view, while pointer moves don't.** A keyboard highlight survives the pointer leaving, and a pointer highlight drops.
- **What shows is separate from what filters.** Opening with a selection shows its label but lists everything until typing starts. Closing without a pick restores the selection and clears the query.
- **Match every query word** against the label and description.
- **A create row** goes last, once nothing matches exactly, so Enter picks a real match first.
- **Multiple values:** Backspace in an empty field removes the last chip. A pick from an unfiltered list stays open for the next, and a pick while filtering closes and clears.
- **Wrapping:** a combobox loops through the field as a stop. A command menu wraps within the list, since the list is its whole keyboard space.

## Menus and selects

- **A popup menu opens ready to act,** with focus on the first enabled row, or on its search field if it has one.
- **Typing while a row has focus** goes into the search field. Space stays with the row. Enter in the field picks nothing unless a row was reached.
- **An unrendered closed select** breaks things that depend on it, such as typeahead and the selected label. Read the primitive before gating on a mounted flag.
- **Width** starts from the trigger, and height caps at the available space.
- **Submenus** stay on their trigger's highlight while open, so a diagonal move to the submenu doesn't light other rows. A hover open takes no focus, and a keyboard open does.
- **Checkbox rows** keep the menu open on toggle.

## Checks, radios, and switches

- **Radio arrows** move focus and select in one step, and wrap. Home and End jump.
- **The whole row** is the target. A press on the small box still leaves focus on the row, so arrows keep working.
- **A switch thumb can be dragged,** using a 2px dead zone to separate it from a click. Past the midpoint toggles, and a cancelled gesture snaps back. Swallow the click that follows a drag.

## Tabs and segmented choices

- **Manual activation** is the default: arrows move focus, and Enter or Space selects. Choose automatic only when switching is instant and harmless.
- **The focus ring** needs room inside any `overflow` wrapper, which negative margins and matching padding give it.

## Steppers and multi-step flows

- **One question per step,** with the region's height following content. Keep the header and footer outside the clip, so neither gets pulled along.
- **Back and Skip** have keyboard paths, and arrows inside a text box only take over at the very start or end.
- **Digits can answer options** when there's a document-level listener, ignored while typing, and answered by only one instance at a time.
- **Restore focus to the new step's first control** only when the user was driving by keyboard. After a mouse click, it would leave a ring on screen.
- **Commit** with a clear shortcut in multi-select and text steps, such as Cmd or Ctrl + Enter.
- **Show progress** in words as well as visually, and let a completed step be revisited unless that's unsafe.
- **Direction** follows the step's movement, as in `craft-motion`.

## Sliders

- **A track press** moves the thumb and starts a drag. Range thumbs can't cross, and a press grabs the nearest one.
- **Snap continuously** while dragging, and spring to the final value on release.
- **An editable value** swaps to a number input on click: Enter or blur commits with clamping, and Escape cancels.
- **Report the formatted value** with `aria-valuetext`, and let arrows walk non-uniform steps.
- **Make the hit area larger** than the visible track, past each edge.

## Dates and times

- **Open on the selected day, or today,** with focus on it. Escape closes and returns focus to the trigger.
- **Mid-range Escape** restores the previous range and stays open. Only a complete range reaches `onChange`.
- **Use `Intl` for labels,** and the locale's 12- or 24-hour clock unless told otherwise.
- **A time field** accepts `1130`, `11:30`, and `11:30am`, and the nearest slot lights up.
- **Reserve width** for the widest date or time, so choosing one moves nothing.
- **Disabled days** say why in their accessible label, such as ", booked". Today can be marked by weight and a dot, without color.

## Tables and grids

- **The fluid hover highlight** sits behind the rows. Hide the borders on either side of the lit row, with a transition, so the highlight stays clean.
- **Only clickable cards light up.** A stretched overlay link is the clickable area, with actions above it, so interactive elements never nest.
- **A disabled card drops the overlay,** since `pointer-events-none` only stops the mouse.

## Dialogs and overlays

- **Fix a tall dialog's height** so the panel scrolls inside it, rather than the dialog growing.
- **Keep the field still** when contents filter. Anchor a command-style dialog by its top edge.
- **Provide one way out at least:** Escape, and a visible control unless the content has its own.

## Tooltips and hints

- **Hover delay** is around 200ms, shared across neighbors, so moving between them is instant.
- **A tooltip showing on press** can be re-shown for "Copied", but only if it was already visible.
- **Hint keys show on desktop only,** because touch has no equivalent.

## Shortcuts

- **Modifier combos** match on `key`, and fall back to the physical `code` only on non-Latin layouts.
- **Bare keys** stay out of editable fields.
- **Several instances** can share a shortcut: an open one answers first, then the one containing focus, then the most recently mounted.
- **Own the Escape chain.** The innermost surface takes it and calls `preventDefault`, and outer surfaces check `defaultPrevented`.

## Drag to reorder and file drop

- **A 4px dead zone** arms the drag, and listeners go on `window`, so release works anywhere. Offer a keyboard path, such as Alt+Arrow.
- **Only react to file drags** whose `dataTransfer.types` include `Files`, and ignore `dragleave` into children. Filter by `accept`, and dedupe by name, size, and date.
- **Hide edit and remove actions until hover** on pointers, and always show them on touch.

## Status and loading

- **Errors and warnings** use `role="alert"`, and the rest `role="status"`. Keep one static status announced, with moving displays `aria-hidden`.
- **A dismissed banner** hands focus onward, and a mostly faded one takes no clicks.
- **Banner text color** stays on the foreground when muted text would fail contrast on a tinted fill. Status color sits in one place at a time.
