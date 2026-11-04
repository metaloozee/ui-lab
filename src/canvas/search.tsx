import { animate, motion, useReducedMotionConfig } from "motion/react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover";
import { omit } from "@/lib/omit";
import { pressMotion } from "@/lib/press";
import { useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

import type { CanvasEntry } from "./registry";

export const SEARCH_WIDTH = "min(28rem, calc(100vw - 2rem))";
const MAX_VISIBLE_ROWS = 8;

/** Every word has to match. Rows keep registry order, so nothing moves under the cursor. */
export function filterEntries(entries: readonly CanvasEntry[], query: string): CanvasEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const text = `${entry.name} ${entry.purpose}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** The field and the rows sit in different parts of the surface, so they share this. */
export function useCanvasSearch({
  entries,
  open,
  onPick,
}: {
  entries: readonly CanvasEntry[];
  open: boolean;
  onPick: (entry: CanvasEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(listRef, { axis: "y" });
  const { setActiveIndex } = hover;
  const reduceMotion = useReducedMotionConfig();
  const listId = useId();
  const stopScroll = useRef<(() => void) | undefined>(undefined);
  const results = useMemo(() => filterEntries(entries, query), [entries, query]);
  const resultsKey = results.map((entry) => entry.id).join("\0");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  // The nearest row always has the highlight, so Enter always has a target.
  useEffect(() => {
    if (!open) return;
    stopScroll.current?.();
    setActiveIndex(resultsKey ? 0 : null);
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [open, resultsKey, setActiveIndex]);

  const rowId = useCallback((index: number) => `${listId}-${index}`, [listId]);

  const scrollToRow = (index: number) => {
    const scroller = scrollerRef.current;
    const row = document.getElementById(rowId(index));
    if (!scroller || !row) return;
    const limit = scroller.scrollHeight - scroller.clientHeight;
    const target = Math.max(
      0,
      Math.min(limit, row.offsetTop - (scroller.clientHeight - row.offsetHeight) / 2),
    );
    stopScroll.current?.();
    if (reduceMotion) {
      scroller.scrollTop = target;
      return;
    }
    // On the highlight's own spring, so the row and its fill travel together.
    const animation = animate(scroller.scrollTop, target, {
      ...spring.fast,
      onUpdate: (value) => {
        scroller.scrollTop = value;
      },
    });
    stopScroll.current = () => animation.stop();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      const entry = results[hover.activeIndex ?? -1];
      if (entry) onPick(entry);
      return;
    }
    // The first row sits beside the field, so Up walks away from it and Down walks back.
    const step = { ArrowUp: 1, ArrowDown: -1 }[event.key];
    if (!step || results.length === 0) return;
    event.preventDefault();
    const next = ((hover.activeIndex ?? -step) + step + results.length) % results.length;
    setActiveIndex(next);
    scrollToRow(next);
  };

  return {
    query,
    setQuery,
    inputRef,
    scrollerRef,
    listRef,
    hover,
    listId,
    rowId,
    results,
    onKeyDown,
    onPick,
    isEmptyCanvas: entries.length === 0,
  };
}

type CanvasSearch = ReturnType<typeof useCanvasSearch>;

export function SearchField({ search, active }: { search: CanvasSearch; active: boolean }) {
  const { field } = useSize();
  const activeIndex = search.hover.activeIndex;
  return (
    <input
      ref={search.inputRef}
      inert={!active}
      value={search.query}
      onChange={(event) => search.setQuery(event.target.value)}
      onKeyDown={search.onKeyDown}
      role="combobox"
      aria-expanded
      aria-autocomplete="list"
      aria-controls={search.listId}
      aria-activedescendant={activeIndex === null ? undefined : search.rowId(activeIndex)}
      aria-label="Search the canvas"
      placeholder="Search the canvas"
      autoComplete="off"
      spellCheck={false}
      className={cn(
        "size-full min-w-0 bg-transparent text-text-primary caret-accent-solid outline-none placeholder:text-text-secondary",
        field,
      )}
    />
  );
}

function ResultRow({
  id,
  entry,
  index,
  search,
}: {
  id: string;
  entry: CanvasEntry;
  index: number;
  search: CanvasSearch;
}) {
  const { controlHeight, icon, text } = useSize();
  const ref = useRef<HTMLDivElement>(null);
  useRegisterFluidHoverItem(search.hover.registerItem, index, ref);
  return (
    <motion.div
      ref={ref}
      id={id}
      role="option"
      aria-selected={search.hover.activeIndex === index}
      {...pressMotion(0.98)}
      // The field keeps focus the whole time, or the rows would shift out from under a click.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => search.onPick(entry)}
      // Text lines up with the search glyph above the same left edge.
      style={{ height: controlHeight, paddingInline: (controlHeight - icon) / 2 }}
      className={cn("relative flex shrink-0 cursor-default items-center text-text-primary", text)}
    >
      <span className="truncate">{entry.name}</span>
    </motion.div>
  );
}

export function SearchResults({ search, active }: { search: CanvasSearch; active: boolean }) {
  const shape = useShape();
  const { controlHeight, icon, text } = useSize();
  const reduceMotion = useReducedMotionConfig();
  const { results, hover } = search;
  // Half a row peeks past the top when there's more, so the list reads as scrollable.
  const rows =
    results.length > MAX_VISIBLE_ROWS ? MAX_VISIBLE_ROWS - 0.5 : Math.max(results.length, 1);
  // Leaving the list keeps the highlight, so Enter still has a target.
  const handlers = omit(hover.handlers, ["onMouseLeave"]);

  return (
    <div
      data-morph-panel="search"
      inert={!active}
      style={{ width: SEARCH_WIDTH, opacity: "var(--morph-search, 0)" }}
    >
      <motion.div
        ref={search.scrollerRef}
        initial={false}
        animate={{ height: rows * controlHeight + 8 }}
        // Height is a layout property, which MotionConfig's reduced motion doesn't cover by itself.
        transition={reduceMotion ? { duration: 0 } : spring.moderate}
        className="max-h-[calc(100dvh-7rem)] overflow-x-clip overflow-y-auto [scrollbar-width:thin]"
      >
        <div
          ref={search.listRef}
          id={search.listId}
          role="listbox"
          aria-label="Canvas items"
          {...handlers}
          className="relative flex flex-col-reverse p-1"
        >
          <FluidHoverHighlight hover={hover} className={shape.bg} />
          {results.map((entry, index) => (
            <ResultRow
              key={entry.id}
              id={search.rowId(index)}
              entry={entry}
              index={index}
              search={search}
            />
          ))}
          {results.length === 0 && (
            <p
              style={{ height: controlHeight, paddingInline: (controlHeight - icon) / 2 }}
              className={cn("flex items-center text-text-secondary", text)}
            >
              {search.isEmptyCanvas ? "Nothing on the canvas yet" : "No matches"}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
