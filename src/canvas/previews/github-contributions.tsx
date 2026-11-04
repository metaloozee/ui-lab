import {
  type FocusEvent,
  type KeyboardEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { animate, motion, useReducedMotionConfig } from "motion/react";

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import { SelfFluidHoverLayer, useSelfFluidHover } from "@/components/self-fluid-hover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip } from "@/components/ui/tooltip";
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover";
import { pressMotion } from "@/lib/press";
import { useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

const API_URL = "https://github-contributions-api.jogruber.de/v4";

/** One grid step: a 14px day and a 2px gap. Days touch through their hit areas, so hover never drops out between them. */
const PITCH = 16;
const WEEKDAYS = 7;
/** Which days appear to fill in first, left to right, and how far apart. */
const REVEAL_STEPS = 8;
const REVEAL_STAGGER = 0.04;
/** A tooltip waits before opening, and stays warm briefly so moving back to the grid is instant. */
const TOOLTIP_DELAY_MS = 200;
const TOOLTIP_WARM_MS = 300;

const MS_PER_DAY = 86_400_000;
const LEVEL_SHARES = [7, 18, 32, 50, 72] as const;

type Level = 0 | 1 | 2 | 3 | 4;
const LEVELS: readonly Level[] = [0, 1, 2, 3, 4];

/** A level is how much ink a day carries, so more always reads as more in both themes. */
const levelFill = (level: Level) =>
  `color-mix(in oklab, var(--color-text-primary) ${LEVEL_SHARES[level]}%, var(--color-bg-surface))`;

export type Contribution = { date: string; count: number; level: Level };

export type CalendarDay = Contribution & {
  week: number;
  weekday: number;
  /** Stable position in the grid: `week * 7 + weekday`. */
  index: number;
  label: string;
};

export type Calendar = {
  days: CalendarDay[];
  weeks: number;
  months: { label: string; week: number }[];
  total: number;
  range: string;
};

// Dates stay in UTC throughout, so a day never shifts with the viewer's timezone. Written day-first
// from en-US parts, since en-GB spells September "Sept" and breaks the row of three-letter months.
const part = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });
const weekdayName = part({ weekday: "short" });
const monthName = part({ month: "short" });
const shortDate = (time: number) => {
  const date = new Date(time);
  return `${date.getUTCDate()} ${monthName.format(time)} ${date.getUTCFullYear()}`;
};
const longDate = (time: number) => `${weekdayName.format(time)}, ${shortDate(time)}`;
const countFormat = new Intl.NumberFormat("en-GB");

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);
const plural = (count: number) => (count === 1 ? "contribution" : "contributions");

function describeDay(count: number, time: number) {
  const amount = count === 0 ? "No" : countFormat.format(count);
  return `${amount} ${plural(count)} on ${longDate(time)}`;
}

/** Lays contributions into week columns, filling any missing day with an empty one. */
export function buildCalendar(contributions: readonly Contribution[]): Calendar {
  const byDate = new Map(contributions.map((day) => [day.date, day]));
  const dates = contributions.map((day) => Date.parse(day.date));
  const first = Math.min(...dates);
  const last = Math.max(...dates);
  const offset = new Date(first).getUTCDay();
  const span = Math.round((last - first) / MS_PER_DAY) + 1;

  const days: CalendarDay[] = [];
  const months: Calendar["months"] = [];
  let total = 0;
  let month = -1;

  for (let i = 0; i < span; i++) {
    const time = first + i * MS_PER_DAY;
    const date = isoDate(time);
    const { count, level } = byDate.get(date) ?? { count: 0, level: 0 as const };
    const position = i + offset;
    const week = Math.floor(position / WEEKDAYS);
    const weekday = position % WEEKDAYS;
    total += count;
    days.push({
      date,
      count,
      level,
      week,
      weekday,
      index: week * WEEKDAYS + weekday,
      label: describeDay(count, time),
    });

    // A month's label sits over the first column that opens inside it.
    const opensColumn = i === 0 || weekday === 0;
    const currentMonth = new Date(time).getUTCMonth();
    if (opensColumn && currentMonth !== month) {
      month = currentMonth;
      months.push({ label: monthName.format(time), week });
    }
  }

  const weeks = Math.floor((span - 1 + offset) / WEEKDAYS) + 1;
  // A sliver of a month at either end has no room for its name.
  if (months.length > 1 && months[1].week - months[0].week < 3) months.shift();
  if (months.length > 1 && weeks - months[months.length - 1].week < 3) months.pop();

  return {
    days,
    weeks,
    months,
    total,
    range: `${shortDate(first)} – ${shortDate(last)}`,
  };
}

/** The same year the data will cover, so the grid and months hold still when it arrives. */
function blankYear(now: number): Contribution[] {
  const today = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  const yearAgo = new Date(today);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const start = yearAgo.getTime() - yearAgo.getUTCDay() * MS_PER_DAY;
  const span = Math.round((today - start) / MS_PER_DAY) + 1;
  return Array.from({ length: span }, (_, i) => ({
    date: isoDate(start + i * MS_PER_DAY),
    count: 0,
    level: 0 as const,
  }));
}

function parseContributions(body: unknown): Contribution[] {
  const list = (body as { contributions?: unknown } | null)?.contributions;
  if (!Array.isArray(list) || list.length === 0) throw new Error("No contributions in response");
  return list.map((entry: { date?: unknown; count?: unknown; level?: unknown }) => {
    const level = LEVELS.find((candidate) => candidate === entry.level);
    if (typeof entry.date !== "string" || typeof entry.count !== "number" || level === undefined) {
      throw new Error("Malformed contribution");
    }
    return { date: entry.date, count: entry.count, level };
  });
}

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; contributions: Contribution[] };

const loaded = new Map<string, Contribution[]>();

function initialLoad(username: string): Load {
  const contributions = loaded.get(username);
  return contributions ? { status: "ready", contributions } : { status: "loading" };
}

function useContributions(username: string) {
  const [load, setLoad] = useState(() => initialLoad(username));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoad(initialLoad(username));
    if (loaded.has(username)) return;
    const request = new AbortController();
    fetch(`${API_URL}/${encodeURIComponent(username)}?y=last`, { signal: request.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Status ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((body) => {
        const contributions = parseContributions(body);
        loaded.set(username, contributions);
        setLoad({ status: "ready", contributions });
      })
      .catch(() => {
        if (!request.signal.aborted) setLoad({ status: "error" });
      });
    return () => request.abort();
  }, [username, attempt]);

  return { load, retry: () => setAttempt((count) => count + 1) };
}

const DayCell = memo(function DayCell({
  day,
  interactive,
  tabbable,
  pressable,
  radius,
  registerItem,
}: {
  day: CalendarDay;
  interactive: boolean;
  tabbable: boolean;
  pressable: boolean;
  radius: number;
  registerItem: (index: number, element: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useRegisterFluidHoverItem(interactive ? registerItem : undefined, day.index, ref);

  return (
    <div
      ref={ref}
      role={interactive ? "gridcell" : undefined}
      aria-label={interactive ? day.label : undefined}
      tabIndex={interactive ? (tabbable ? 0 : -1) : undefined}
      data-day={day.index}
      style={{ gridColumn: day.week + 1, gridRow: day.weekday + 1 }}
      className="p-px outline-none"
    >
      <span
        className={cn(
          "relative block size-3.5 transition-[scale] duration-[var(--spring-fast,80ms)]",
          pressable && "active:scale-[0.85]",
        )}
        style={{ backgroundColor: levelFill(0), borderRadius: radius }}
      >
        {day.level > 0 && (
          <span
            data-reveal={day.week}
            className="absolute inset-0 rounded-[inherit]"
            style={{ backgroundColor: levelFill(day.level) }}
          />
        )}
      </span>
    </div>
  );
});

const textActionClass =
  "relative inline-block cursor-pointer rounded-sm text-text-secondary underline decoration-border-strong underline-offset-2 outline-none data-[fluid-hover-active-index]:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus";

function GitHubLink({ username }: { username: string }) {
  const self = useSelfFluidHover<HTMLAnchorElement>();
  return (
    <motion.a
      ref={self.ref}
      {...pressMotion(0.96)}
      {...self.hover.handlers}
      href={`https://github.com/${encodeURIComponent(username)}`}
      target="_blank"
      rel="noreferrer"
      className={textActionClass}
    >
      <SelfFluidHoverLayer self={self} className="-inset-x-0.5" />
      <span className="relative">GitHub</span>
    </motion.a>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  const self = useSelfFluidHover<HTMLButtonElement>();
  return (
    <motion.button
      ref={self.ref}
      {...pressMotion(0.96)}
      {...self.hover.handlers}
      type="button"
      onClick={onClick}
      className={textActionClass}
    >
      <SelfFluidHoverLayer self={self} />
      <span className="relative">Try again</span>
    </motion.button>
  );
}

function Summary({
  load,
  calendar,
  username,
  onRetry,
}: {
  load: Load;
  calendar: Calendar;
  username: string;
  onRetry: () => void;
}) {
  if (load.status === "error") {
    return (
      <div role="alert">
        Couldn’t load contributions. <RetryButton onClick={onRetry} />
      </div>
    );
  }
  return (
    <div role="status">
      {load.status === "loading" ? (
        "Loading contributions…"
      ) : (
        <>
          <span className="tabular-nums">{countFormat.format(calendar.total)}</span>{" "}
          {plural(calendar.total)}, {calendar.range}. Source: <GitHubLink username={username} />.
        </>
      )}
    </div>
  );
}

export function GitHubContributions({ username }: { username: string }) {
  const { load, retry } = useContributions(username);
  const shape = useShape();
  const size = useSize();
  const reduceMotion = useReducedMotionConfig() ?? false;
  const ready = load.status === "ready";

  const [now] = useState(() => Date.now());
  const contributions = ready ? load.contributions : null;
  const calendar = useMemo(
    () => buildCalendar(contributions ?? blankYear(now)),
    [contributions, now],
  );
  const dayAt = useMemo(() => new Map(calendar.days.map((day) => [day.index, day])), [calendar]);

  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(gridRef, { axis: "xy", gapClick: false });

  const newest = calendar.days[calendar.days.length - 1].index;
  const [cursor, setCursor] = useState<number | null>(null);
  const [keyboardDay, setKeyboardDay] = useState<number | null>(null);
  const tabStop = cursor !== null && dayAt.has(cursor) ? cursor : newest;

  // One highlight and one tooltip serve the pointer and the keyboard, and the pointer wins.
  const shown = hover.activeIndex ?? keyboardDay;

  const [warm, setWarm] = useState(false);
  const active = shown !== null;
  useEffect(() => {
    if (active === warm) return;
    const timer = window.setTimeout(
      () => setWarm(active),
      active ? TOOLTIP_DELAY_MS : TOOLTIP_WARM_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, warm]);

  // The last day shown stays in place while the tooltip leaves. Escape hides it until the day changes.
  const [tracked, setTracked] = useState<number | null>(null);
  const [lastShown, setLastShown] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (tracked !== shown) {
    setTracked(shown);
    setDismissed(false);
    if (shown !== null) setLastShown(shown);
  }
  const tooltipDay = lastShown === null ? undefined : dayAt.get(lastShown);

  // A narrow view starts on the latest weeks, where the reader is most likely to look.
  useLayoutEffect(() => {
    const viewport = rootRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollLeft = viewport.scrollWidth;
  }, []);

  // Days fill in once, only when the data arrives while this is on screen.
  const revealed = useRef(ready);
  useLayoutEffect(() => {
    if (!ready || revealed.current) return;
    revealed.current = true;
    const buckets = new Map<number, HTMLElement[]>();
    gridRef.current?.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
      const step = Math.floor((Number(element.dataset.reveal) / calendar.weeks) * REVEAL_STEPS);
      buckets.set(step, [...(buckets.get(step) ?? []), element]);
    });
    const running = [...buckets].map(([step, elements]) =>
      animate(elements, reduceMotion ? { opacity: [0, 1] } : { opacity: [0, 1], scale: [0.6, 1] }, {
        ...spring.moderate,
        delay: step * REVEAL_STAGGER,
      }),
    );
    return () => running.forEach((animation) => animation.stop());
  }, [ready, calendar.weeks, reduceMotion]);

  const focusDay = (index: number) => {
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${index}"]`)?.focus();
  };

  const targetFor = (event: KeyboardEvent, day: CalendarDay): number | undefined => {
    const { week, weekday } = day;
    switch (event.key) {
      case "ArrowLeft":
        return day.index - WEEKDAYS;
      case "ArrowRight":
        return day.index + WEEKDAYS;
      case "ArrowUp":
        return weekday > 0 ? day.index - 1 : undefined;
      case "ArrowDown":
        return weekday < WEEKDAYS - 1 ? day.index + 1 : undefined;
      case "Home": {
        if (event.ctrlKey || event.metaKey) return calendar.days[0].index;
        return dayAt.has(weekday) ? weekday : weekday + WEEKDAYS;
      }
      case "End": {
        if (event.ctrlKey || event.metaKey) return newest;
        const lastInRow = (calendar.weeks - 1) * WEEKDAYS + weekday;
        return dayAt.has(lastInRow)
          ? lastInRow
          : week === calendar.weeks - 1
            ? undefined
            : lastInRow - WEEKDAYS;
      }
      default:
        return undefined;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const day = dayAt.get(tabStop);
    if (
      !day ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const target = targetFor(event, day);
    if (target !== undefined && dayAt.has(target)) focusDay(target);
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const index = Number(event.target.dataset.day);
    if (!dayAt.has(index)) return;
    setCursor(index);
    // Only keyboard focus draws the ring and opens the tooltip.
    if (event.target.matches(":focus-visible")) setKeyboardDay(index);
  };

  const dayRadius = shape.variant === "pill" ? 7 : 3;
  const registerItem = hover.registerItem;

  // Kept out of each render, so moving the highlight never re-renders 368 days.
  const rows = useMemo(
    () =>
      Array.from({ length: WEEKDAYS }, (_, weekday) => (
        <div key={weekday} role={ready ? "row" : undefined} className="contents">
          {calendar.days
            .filter((day) => day.weekday === weekday)
            .map((day) => (
              <DayCell
                key={day.date}
                day={day}
                interactive={ready}
                tabbable={day.index === tabStop}
                pressable={!reduceMotion}
                radius={dayRadius}
                registerItem={registerItem}
              />
            ))}
        </div>
      )),
    [calendar, ready, tabStop, reduceMotion, dayRadius, registerItem],
  );

  const shownDay = shown === null ? undefined : dayAt.get(shown);
  const anchorDay = shownDay ?? tooltipDay;

  return (
    <div ref={rootRef} className={cn("w-full pt-4 pb-4 text-text-secondary", size.type.caption)}>
      <ScrollArea orientation="horizontal" viewportClassName="scroll-fade-x overscroll-x-contain">
        <div className="w-max px-[15px] pb-2">
          <div aria-hidden className="relative mb-1.5 h-4">
            {calendar.months.map((month) => (
              <span
                key={`${month.label}-${month.week}`}
                className="absolute top-0 left-px"
                style={{ transform: `translateX(${month.week * PITCH}px)` }}
              >
                {month.label}
              </span>
            ))}
          </div>
          <div
            ref={gridRef}
            {...hover.handlers}
            role={ready ? "grid" : undefined}
            aria-label={ready ? `Contributions by ${username}, ${calendar.range}` : undefined}
            aria-hidden={ready ? undefined : true}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={() => setKeyboardDay(null)}
            // A press shouldn't take focus: the days only describe themselves.
            onMouseDown={(event) => event.preventDefault()}
            className="relative grid w-max"
            style={{
              gridTemplateColumns: `repeat(${calendar.weeks}, ${PITCH}px)`,
              gridTemplateRows: `repeat(${WEEKDAYS}, ${PITCH}px)`,
            }}
          >
            <FluidHoverHighlight
              rect={
                shownDay
                  ? {
                      left: shownDay.week * PITCH,
                      top: shownDay.weekday * PITCH,
                      width: PITCH,
                      height: PITCH,
                    }
                  : null
              }
              session={hover.session}
              // One pixel outside the day, so its corners stay concentric.
              className={cn(
                "bg-transparent ring-1 ring-text-secondary ring-inset",
                shape.variant === "pill" ? "rounded-lg" : "rounded-sm",
                shown === keyboardDay && "ring-2 ring-border-focus ring-offset-0",
              )}
            />
            {rows}
            <Tooltip
              content={tooltipDay?.label}
              forceOpen={active && warm && !dismissed && !!tooltipDay}
              onOpenChange={(open) => {
                if (!open) setDismissed(true);
              }}
              side="top"
              sideOffset={6}
              className="whitespace-nowrap tabular-nums"
              contentClassName={cn(
                !reduceMotion &&
                  "transition-[top,left,transform] duration-[var(--spring-moderate,160ms)]",
              )}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 left-0"
                style={{
                  width: PITCH,
                  height: PITCH,
                  transform: anchorDay
                    ? `translate(${anchorDay.week * PITCH}px, ${anchorDay.weekday * PITCH}px)`
                    : undefined,
                }}
              />
            </Tooltip>
          </div>
        </div>
      </ScrollArea>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4">
        <Summary load={load} calendar={calendar} username={username} onRetry={retry} />
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <span aria-hidden className="flex gap-0.5">
            {LEVELS.map((level) => (
              <span
                key={level}
                className="size-3"
                style={{ backgroundColor: levelFill(level), borderRadius: dayRadius }}
              />
            ))}
          </span>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
