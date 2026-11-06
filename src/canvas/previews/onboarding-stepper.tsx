import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  animate,
  AnimatePresence,
  type AnimationPlaybackControls,
  motion,
  type MotionValue,
  useMotionValue,
  useReducedMotionConfig,
} from "motion/react";

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import {
  mergeFluidHoverHandlers,
  SelfFluidHoverLayer,
  useSelfFluidHover,
} from "@/components/self-fluid-hover";
import { Button } from "@/components/ui/button";
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover";
import { fontWeights } from "@/lib/font-weight";
import { useIcons } from "@/lib/icon-context";
import { nestedRadius, useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { getMotionTuning, spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

export type Competitor = { name: string; domain: string };

const FRAME_WIDTH = 480;
const FRAME_HEIGHT = 520;
const PAD = 24;
const HEADER_TOP = 44;
const HEADER_TILE = 24;
const FIELD_TOP = 244;
const CENTER_TILE = 64;
const LOADING_TILE_TOP = 170;
const DONE_TILE_TOP = 130;
const RING_GAP = 6;
const RING_STROKE = 2;

const MAX_PICKS = 5;
const STEP_TITLES = [
  "Enter your website",
  "Choose your competitors",
  "Pick prompts to track",
] as const;

type Gate = "site" | "rivals" | "finish";
type Step = 0 | 1 | 2;
type Phase =
  | { kind: "step"; step: Step }
  | { kind: "loading"; gate: Gate; failed: boolean }
  | { kind: "done" };

const GATES: Record<Gate, { from: Step; stages: readonly string[] }> = {
  site: { from: 0, stages: ["Reading your site", "Finding your market"] },
  rivals: { from: 1, stages: ["Comparing competitors", "Writing prompts"] },
  finish: { from: 2, stages: ["Setting up tracking"] },
};

/** The simulated wait is the subject here, so it has its own timing. Inspect's Speed still divides it. */
const LOAD_SECONDS = 1.7;
const STAGE_HOLD_SECONDS = 0.14;
const FAVICON_DEBOUNCE_MS = 400;
/** The reserved domain that makes each loader fail once, so its recovery can be reviewed. */
const FAILING_DOMAIN = "fail.test";

/** The element's reason to exist is physical feedback, so this one spring may overshoot. Read at call time, so Feel and Speed reach it. */
const hapticSpring = () => ({
  type: "spring" as const,
  duration: spring.slow.duration * 1.25,
  bounce: 0.45,
});

/** The bare domain of what someone typed, or null when it can't be a website. */
export function parseDomain(input: string): string | null {
  const value = input.trim();
  if (!value || /\s|@/.test(value)) return null;
  const hasScheme = value.includes("://");
  if (hasScheme && !/^https?:\/\//i.test(value)) return null;
  let host: string;
  try {
    host = new URL(hasScheme ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  const domain = host.replace(/^www\./, "");
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,}$/.test(domain) ? domain : null;
}

/** A site can't compete with itself, including from a subdomain. */
export function visibleCompetitors(
  competitors: readonly Competitor[],
  site: string | null,
): readonly Competitor[] {
  if (!site) return competitors;
  return competitors.filter(({ domain }) => site !== domain && !site.endsWith(`.${domain}`));
}

export type TrackedPrompt = { id: string; text: string; namesRival: boolean };

export function promptsFor(site: string, rival: string): TrackedPrompt[] {
  return [
    {
      id: "best-tool",
      text: "What’s the best project management tool for startups?",
      namesRival: false,
    },
    {
      id: "issue-tracker",
      text: "Which issue tracker do engineering teams recommend?",
      namesRival: false,
    },
    { id: "small-teams", text: `Is ${site} a good fit for small teams?`, namesRival: false },
    { id: "compare", text: `How does ${site} compare with ${rival}?`, namesRival: true },
    { id: "alternatives", text: `What are the best alternatives to ${rival}?`, namesRival: true },
    { id: "worth-paying", text: `Is ${site} worth paying for?`, namesRival: false },
  ];
}

/** Prompts that named a competitor no longer leading the list lose their meaning, so they're deselected. */
export function reconcilePrompts(
  selected: readonly string[],
  previousRival: string | null,
  nextRival: string,
): string[] {
  if (previousRival === null || previousRival === nextRival) return [...selected];
  const named = new Set(
    promptsFor("", "")
      .filter((prompt) => prompt.namesRival)
      .map((prompt) => prompt.id),
  );
  return selected.filter((id) => !named.has(id));
}

export type PickOutcome = "added" | "removed" | "refused";

export function togglePick(
  picks: readonly string[],
  id: string,
  max: number,
): { picks: string[]; outcome: PickOutcome } {
  if (picks.includes(id)) {
    return { picks: picks.filter((pick) => pick !== id), outcome: "removed" };
  }
  if (picks.length >= max) return { picks: [...picks], outcome: "refused" };
  return { picks: [...picks, id], outcome: "added" };
}

/**
 * The on-screen order of a list with its selections drawn together. They gather where the first
 * pick sits, in list order, and everything else keeps its place around them, so a single pick or an
 * adjacent one moves nothing.
 */
export function groupedOrder(ids: readonly string[], picks: readonly string[]): string[] {
  const picked = new Set(picks.filter((pick) => ids.includes(pick)));
  const anchor = picks.find((pick) => picked.has(pick));
  if (anchor === undefined) return [...ids];
  const before = ids.slice(0, ids.indexOf(anchor)).filter((id) => !picked.has(id));
  const after = ids.slice(ids.indexOf(anchor)).filter((id) => !picked.has(id));
  return [...before, ...ids.filter((id) => picked.has(id)), ...after];
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const faviconUrl = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

const faviconCache = new Map<string, Promise<boolean>>();

/** Whether a real icon exists. The service answers a miss with its own 16px globe, which an image still loads, so size tells them apart. */
function loadFavicon(domain: string): Promise<boolean> {
  const cached = faviconCache.get(domain);
  if (cached) return cached;
  const result = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image.naturalWidth > 16);
    image.onerror = () => resolve(false);
    image.src = faviconUrl(domain);
  });
  faviconCache.set(domain, result);
  return result;
}

type FaviconStatus = "empty" | "pending" | "found" | "missing";

function useFavicon(domain: string | null, debounceMs: number): FaviconStatus {
  const [result, setResult] = useState<{ domain: string; found: boolean } | null>(null);
  useEffect(() => {
    if (!domain) return;
    let live = true;
    const timer = setTimeout(() => {
      void loadFavicon(domain).then((found) => {
        if (live) setResult({ domain, found });
      });
    }, debounceMs);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [domain, debounceMs]);
  if (!domain) return "empty";
  if (result?.domain !== domain) return "pending";
  return result.found ? "found" : "missing";
}

/** One-off physical responses, driven from code so a key and a pointer feel the same. */
function useKick() {
  const reduceMotion = useReducedMotionConfig();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);

  const shake = useCallback(() => {
    if (reduceMotion) return;
    animate(x, [x.get(), -5, 4, -3, 2, 0], {
      duration: spring.slow.duration * 1.4,
      ease: "easeOut",
    });
  }, [reduceMotion, x]);

  const dip = useCallback(
    (depth = 1) => {
      if (reduceMotion) return;
      animate(y, [y.get(), depth, 0], { duration: spring.moderate.duration, ease: "easeOut" });
    },
    [reduceMotion, y],
  );

  const press = useCallback(
    (depth = 0.97) => {
      if (reduceMotion) return;
      animate(scale, depth, {
        ...spring.fast,
        onComplete: () => void animate(scale, 1, hapticSpring()),
      });
    },
    [reduceMotion, scale],
  );

  const pop = useCallback((amount = 0.06) => press(1 + amount), [press]);

  return { style: { x, y, scale }, shake, dip, press, pop };
}

function FaviconImage({ domain, className }: { domain: string; className: string }) {
  return (
    <img
      src={faviconUrl(domain)}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      className={cn("object-contain", className)}
    />
  );
}

/** Favicons are drawn for a browser tab, so many vanish on a dark fill. They always sit on white. */
// oxlint-disable-next-line ui-lab/design-tokens -- A fixed plate for third-party artwork, in both themes.
const FAVICON_PLATE = "oklch(1 0 0)";

function CheckMark({ on, size }: { on: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="relative"
    >
      <motion.path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={
          on
            ? { duration: spring.moderate.duration, ease: "easeOut" }
            : { ...spring.fast.exit, ease: "easeIn" }
        }
      />
    </svg>
  );
}

function Segment({
  lit,
  following,
  progress,
}: {
  lit: boolean;
  following: boolean;
  progress: MotionValue<number>;
}) {
  const fill = useMotionValue(lit ? 1 : 0);
  useEffect(() => {
    if (following) {
      fill.set(progress.get());
      return progress.on("change", (value) => fill.set(value));
    }
    const controls = animate(fill, lit ? 1 : 0, spring.moderate);
    return () => controls.stop();
  }, [fill, following, lit, progress]);
  return (
    <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-active">
      <motion.span
        className="absolute inset-0 origin-left rounded-full bg-accent-solid"
        style={{ scaleX: fill }}
      />
    </span>
  );
}

/** The favicon as one object: beside the field, then the loader, then the header, then the payoff. */
function Tile({
  domain,
  status,
  pose,
  showRing,
  progress,
  failed,
  done,
}: {
  domain: string | null;
  status: FaviconStatus;
  pose: { x: number; y: number; size: number; radius: number };
  showRing: boolean;
  progress: MotionValue<number>;
  failed: boolean;
  done: boolean;
}) {
  const icons = useIcons();
  const size = useSize();
  const reduceMotion = useReducedMotionConfig();
  const kick = useKick();
  const { pop } = kick;
  const Globe = icons.globe;
  const X = icons.x;
  const ringSize = CENTER_TILE + 2 * (RING_GAP + RING_STROKE);
  const frameTransition = reduceMotion ? { duration: 0 } : spring.slow;

  useEffect(() => {
    if (done) pop(0.1);
  }, [done, pop]);

  useEffect(() => {
    if (!showRing) return;
    // A completed stage lands on the same value the ring is holding, so its pulse follows the ring.
    let last = progress.get();
    return progress.on("change", (value) => {
      if (value >= 1 && last < 1) pop(0.05);
      last = value;
    });
  }, [pop, progress, showRing]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-10"
      initial={false}
      animate={{ x: pose.x, y: pose.y, width: pose.size, height: pose.size }}
      transition={frameTransition}
    >
      <motion.div className="absolute inset-0" style={kick.style}>
        <motion.div
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden border border-border-default bg-bg-nested text-text-secondary",
          )}
          initial={false}
          animate={{ borderRadius: pose.radius }}
          transition={frameTransition}
          style={status === "found" ? { backgroundColor: FAVICON_PLATE } : undefined}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {status === "found" && domain ? (
              <motion.span
                key={domain}
                className="flex size-full items-center justify-center"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0, transition: spring.fast.exit }}
                transition={hapticSpring()}
              >
                <FaviconImage domain={domain} className="size-[62%]" />
              </motion.span>
            ) : (
              <motion.span
                key="globe"
                className="flex items-center justify-center"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: status === "pending" && !reduceMotion ? [1, 0.45, 1] : 1,
                }}
                exit={{ scale: 0.8, opacity: 0, transition: spring.fast.exit }}
                transition={
                  status === "pending" && !reduceMotion
                    ? { duration: spring.slow.duration * 3, repeat: Infinity, ease: "easeInOut" }
                    : spring.moderate
                }
              >
                <Globe size={size.icon} strokeWidth={1.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.svg
          width={ringSize}
          height={ringSize}
          viewBox={`0 0 ${ringSize} ${ringSize}`}
          fill="none"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={false}
          animate={{ opacity: showRing ? 1 : 0 }}
          transition={
            showRing ? { ...spring.moderate, delay: spring.slow.duration * 0.7 } : spring.fast.exit
          }
        >
          <rect
            x={RING_STROKE / 2}
            y={RING_STROKE / 2}
            width={ringSize - RING_STROKE}
            height={ringSize - RING_STROKE}
            rx={pose.radius + RING_GAP + RING_STROKE / 2}
            strokeWidth={RING_STROKE}
            className="stroke-border-default"
          />
          <motion.rect
            x={RING_STROKE / 2}
            y={RING_STROKE / 2}
            width={ringSize - RING_STROKE}
            height={ringSize - RING_STROKE}
            rx={pose.radius + RING_GAP + RING_STROKE / 2}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            className={cn(failed ? "stroke-danger-solid" : "stroke-accent-solid")}
            style={{ pathLength: progress }}
          />
        </motion.svg>

        <AnimatePresence initial={false}>
          {(done || failed) && (
            <motion.span
              key={done ? "done" : "failed"}
              className={cn(
                "absolute -right-1.5 -bottom-1.5 flex size-[22px] items-center justify-center rounded-full",
                done
                  ? "bg-success-solid text-success-on-solid"
                  : "bg-danger-solid text-danger-on-solid",
              )}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0, transition: spring.fast.exit }}
              transition={{ ...hapticSpring(), delay: spring.fast.duration }}
            >
              {done ? <DrawnCheck /> : <X size={12} strokeWidth={2.5} />}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/** Starts undrawn on mount, unlike a row's check, because success always arrives. */
function DrawnCheck() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden>
      <motion.path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: spring.slow.duration,
          ease: "easeOut",
          delay: spring.moderate.duration,
        }}
      />
    </svg>
  );
}

type Edit = "type" | "delete" | "paste" | "rewrite";

function classifyEdit(previous: string, next: string): Edit {
  if (next.startsWith(previous)) return next.length - previous.length > 1 ? "paste" : "type";
  if (previous.startsWith(next)) return "delete";
  return "rewrite";
}

function UrlField({
  value,
  onChange,
  onSubmit,
  error,
  labelledBy,
  left,
  right,
  top,
  focusStep,
  kick,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error: string | null;
  labelledBy: string;
  left: number;
  right: number;
  top: number;
  focusStep: number;
  kick: ReturnType<typeof useKick>;
}) {
  const size = useSize();
  const shape = useShape();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const self = useSelfFluidHover<HTMLDivElement>();
  const previous = useRef(value);
  const firstNewChar = useRef(value.length);
  const [generation, setGeneration] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const [composing, setComposing] = useState(false);
  // Past the field's width, or mid-composition, the real input's own text shows: scrolling a drawn copy in step with it isn't worth the drift.
  const native = overflowing || composing;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) setOverflowing(input.scrollWidth > input.clientWidth);
  }, [value, size.field]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    const edit = classifyEdit(previous.current, next);
    firstNewChar.current = previous.current.length;
    previous.current = next;
    if (edit === "rewrite") setGeneration((count) => count + 1);
    else kick.dip(edit === "delete" ? 0.5 : edit === "paste" ? 1.5 : 1);
    onChange(next);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <>
      <motion.div
        className="absolute"
        style={{ left, right, top, ...kick.style }}
        onPointerDown={() => kick.dip(1)}
      >
        <div
          ref={self.ref}
          {...mergeFluidHoverHandlers(self.hover.handlers, {})}
          className={cn(
            "relative border bg-bg-nested transition-[border-color,box-shadow] duration-[var(--spring-fast)]",
            size.control,
            shape.input,
            error
              ? "border-danger-solid"
              : "border-border-default focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus",
          )}
        >
          <SelfFluidHoverLayer self={self} />
          {!native && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 flex items-center text-text-primary",
                size.px,
              )}
              style={{ fontKerning: "none", fontVariantLigatures: "none" }}
            >
              <span className={cn("relative block whitespace-pre", size.field)}>
                <AnimatePresence key={generation} initial={false} mode="popLayout">
                  {Array.from(value).map((char, index) => (
                    <motion.span
                      // The position is the identity: a typed character is a new end, and a deleted one is the old end leaving.
                      key={index}
                      className="inline-block"
                      initial={{ y: 5, opacity: 0, scale: 0.85 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: 4, opacity: 0, transition: spring.fast.exit }}
                      transition={{
                        ...hapticSpring(),
                        delay: Math.min(Math.max(0, index - firstNewChar.current), 8) * 0.012,
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </span>
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="acme.com"
            value={value}
            aria-labelledby={labelledBy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            data-step-focus={focusStep}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            style={{ fontKerning: "none", fontVariantLigatures: "none" }}
            className={cn(
              "absolute inset-0 w-full rounded-[inherit] bg-transparent caret-text-primary outline-none placeholder:text-text-secondary",
              size.field,
              size.px,
              native ? "text-text-primary" : "text-transparent",
            )}
          />
        </div>
      </motion.div>
      <div
        className={cn("absolute text-danger-text", size.type.caption)}
        style={{ left, right, top: top + size.controlHeight + 8 }}
      >
        <AnimatePresence initial={false}>
          {error && (
            <motion.p
              key={error}
              id={errorId}
              role="alert"
              initial={{ y: -4, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: spring.fast.exit }}
              transition={spring.moderate}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

type RowData = { id: string; label: string; logo?: { domain: string; name: string } };

function RowLogo({ domain, name }: { domain: string; name: string }) {
  const size = useSize();
  const status = useFavicon(domain, 0);
  const found = status === "found";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-border-default bg-bg-surface text-text-secondary",
        size.type.micro,
      )}
      style={found ? { backgroundColor: FAVICON_PLATE } : undefined}
    >
      {found ? <FaviconImage domain={domain} className="size-[80%]" /> : name.charAt(0)}
    </span>
  );
}

function Row({
  row,
  slot,
  selected,
  previousSelected,
  nextSelected,
  tabbable,
  ignoresPointer,
  focusStep,
  onToggle,
  onFocus,
}: {
  row: RowData;
  slot: number;
  selected: boolean;
  previousSelected: boolean;
  nextSelected: boolean;
  tabbable: boolean;
  ignoresPointer: boolean;
  focusStep: number;
  onToggle: (id: string, event: ReactMouseEvent<HTMLButtonElement>) => PickOutcome;
  onFocus: (id: string, keyboard: boolean) => void;
}) {
  const size = useSize();
  const shape = useShape();
  const kick = useKick();

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const outcome = onToggle(row.id, event);
    if (outcome === "refused") kick.shake();
    else kick.press(outcome === "added" ? 0.98 : 0.99);
  };

  const topRadius = previousSelected ? 0 : shape.bgRadius;
  const bottomRadius = nextSelected ? 0 : shape.bgRadius;

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      data-row={row.id}
      data-step-focus={tabbable ? focusStep : undefined}
      initial={false}
      animate={{ y: slot * size.controlHeight }}
      whileTap={{ scale: 0.98, transition: spring.fast }}
      transition={{ ...hapticSpring(), y: spring.slow }}
      onClick={handleClick}
      onFocus={(event) => onFocus(row.id, event.currentTarget.matches(":focus-visible"))}
      className={cn(
        "absolute inset-x-1 top-1 block cursor-pointer text-start outline-none",
        size.control,
        shape.bg,
        // A selected row travels in front of the ones making way for it.
        selected && "z-[1]",
        ignoresPointer && "pointer-events-none",
      )}
    >
      {/* Solid from the first frame, so a travelling row never shows the labels it crosses. Only the shade fades. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 overflow-hidden bg-bg-nested"
        initial={false}
        animate={{
          opacity: selected ? 1 : 0,
          borderTopLeftRadius: topRadius,
          borderTopRightRadius: topRadius,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
        }}
        transition={{ ...spring.moderate, opacity: selected ? { duration: 0 } : spring.moderate }}
      >
        <motion.span
          className="absolute inset-0 bg-bg-active"
          initial={false}
          animate={{ opacity: selected ? 1 : 0 }}
          transition={spring.moderate}
        />
      </motion.span>
      <motion.span
        className={cn(
          "relative flex h-full items-center",
          size.gap,
          size.itemPx,
          size.text,
          "transition-[color,font-variation-settings] duration-[var(--spring-fast)]",
          selected ? "text-text-primary" : "text-text-secondary",
        )}
        style={{
          ...kick.style,
          fontVariationSettings: selected ? fontWeights.semibold : fontWeights.normal,
        }}
      >
        {row.logo && <RowLogo domain={row.logo.domain} name={row.logo.name} />}
        <span title={row.label} className="min-w-0 flex-1 truncate">
          {row.label}
        </span>
        <span
          aria-hidden
          className="relative flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-border-strong text-text-on-accent"
        >
          <motion.span
            className="absolute -inset-px rounded-[5px] bg-accent-solid"
            initial={false}
            animate={{ scale: selected ? 1 : 0.4, opacity: selected ? 1 : 0 }}
            transition={selected ? hapticSpring() : spring.fast}
          />
          <CheckMark on={selected} size={12} />
        </span>
      </motion.span>
    </motion.button>
  );
}

/** Holds a place in the list, so hover and scrolling read fixed slots while the rows travel over them. */
function RowSlot({
  slot,
  registerItem,
}: {
  slot: number;
  registerItem: (index: number, element: HTMLElement | null) => void;
}) {
  const size = useSize();
  const ref = useRef<HTMLDivElement>(null);
  useRegisterFluidHoverItem(registerItem, slot, ref);
  return <div ref={ref} aria-hidden data-slot-index={slot} className={size.control} />;
}

/** The pointer stops counting as aimed once a row has moved out from under it, until it really moves. */
const SETTLE_DISTANCE = 2;
const LIST_HOVER = { nearest: true, gapClick: false } as const;

function PickList({
  rows,
  selected,
  label,
  focusStep,
  onToggle,
}: {
  rows: readonly RowData[];
  selected: readonly string[];
  label: string;
  focusStep: number;
  onToggle: (id: string) => PickOutcome;
}) {
  const shape = useShape();
  const listRef = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(listRef, LIST_HOVER);
  const { setActiveIndex } = hover;
  const ids = rows.map((row) => row.id);
  const order = groupedOrder(ids, selected);
  const orderKey = order.join();
  const [tabStop, setTabStop] = useState(selected[0] ?? order[0]);
  const [settlingAt, setSettlingAt] = useState<{ x: number; y: number } | null>(null);
  const lastPointerType = useRef("");

  const reveal = useEffectEvent((slot: number) => {
    const list = listRef.current;
    const place = list?.querySelector<HTMLElement>(`[data-slot-index="${slot}"]`);
    if (!list || !place) return;
    setActiveIndex(slot);
    if (place.offsetTop < list.scrollTop) list.scrollTop = place.offsetTop;
    else if (place.offsetTop + place.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = place.offsetTop + place.offsetHeight - list.clientHeight;
    }
  });

  // A row toggled from the keyboard keeps focus as it travels, and the highlight goes with it.
  useEffect(() => {
    const active = document.activeElement;
    if (!listRef.current?.contains(active) || !active?.matches(":focus-visible")) return;
    const slot = orderKey.split(",").indexOf(active.getAttribute("data-row") ?? "");
    if (slot >= 0) reveal(slot);
  }, [orderKey]);

  const handleToggle = (id: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    const next = groupedOrder(ids, togglePick(selected, id, MAX_PICKS).picks);
    // A keyboard click reports no detail, and a finger leaves nothing resting to slide under.
    if (event.detail > 0 && lastPointerType.current === "mouse" && next.join() !== orderKey) {
      setSettlingAt({ x: event.clientX, y: event.clientY });
    }
    return onToggle(id);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = order.indexOf(tabStop);
    const last = order.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, current + 1),
      ArrowUp: Math.max(0, current - 1),
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const row = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []).find(
      (element) => element.dataset.row === order[next],
    );
    row?.focus({ preventScroll: true });
    reveal(next);
  };

  return (
    <div
      ref={listRef}
      role="group"
      aria-label={label}
      {...hover.handlers}
      onPointerDownCapture={(event) => {
        lastPointerType.current = event.pointerType;
      }}
      onMouseMove={(event) => {
        hover.handlers.onMouseMove(event);
        if (
          settlingAt &&
          Math.hypot(event.clientX - settlingAt.x, event.clientY - settlingAt.y) > SETTLE_DISTANCE
        ) {
          setSettlingAt(null);
        }
      }}
      onMouseLeave={() => {
        hover.handlers.onMouseLeave();
        setSettlingAt(null);
      }}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setActiveIndex(null);
      }}
      className={cn(
        "scroll-fade relative max-h-full min-h-0 overflow-y-auto overscroll-contain border border-border-default bg-bg-nested p-1",
        shape.container,
      )}
    >
      <FluidHoverHighlight hover={hover} hidden={settlingAt !== null} className={shape.bg} />
      {rows.map((_, slot) => (
        <RowSlot key={slot} slot={slot} registerItem={hover.registerItem} />
      ))}
      {/* Rows stay in one DOM order, so moving one never drops its focus. Arrows follow what's on screen. */}
      {rows.map((row) => {
        const slot = order.indexOf(row.id);
        return (
          <Row
            key={row.id}
            row={row}
            slot={slot}
            selected={selected.includes(row.id)}
            previousSelected={slot > 0 && selected.includes(order[slot - 1])}
            nextSelected={slot < order.length - 1 && selected.includes(order[slot + 1])}
            tabbable={row.id === tabStop}
            ignoresPointer={settlingAt !== null}
            focusStep={focusStep}
            onToggle={handleToggle}
            onFocus={(id, keyboard) => {
              setTabStop(id);
              if (keyboard) setActiveIndex(order.indexOf(id));
            }}
          />
        );
      })}
    </div>
  );
}

function PickCount({ count, kick }: { count: number; kick: ReturnType<typeof useKick> }) {
  const size = useSize();
  const previous = useRef(count);
  const rising = count >= previous.current;
  useEffect(() => {
    previous.current = count;
  }, [count]);
  const direction = rising ? 1 : -1;
  return (
    <motion.span
      className={cn(
        "relative inline-flex overflow-hidden whitespace-nowrap text-text-secondary tabular-nums",
        size.type.caption,
      )}
      style={kick.style}
    >
      <span className="relative inline-block">
        <span className="invisible">0</span>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.span
            key={count}
            className="absolute inset-0"
            custom={direction}
            initial={{ y: direction * 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: direction * -10, opacity: 0, transition: spring.fast.exit }}
            transition={hapticSpring()}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </span>
      /{MAX_PICKS}
    </motion.span>
  );
}

/** Stays mounted with its width reserved, so the button never moves when its action changes. */
function ActionLabel({ label }: { label: string }) {
  return (
    <span className="relative inline-grid justify-items-center overflow-hidden">
      {["Continue", "Submit", "Try again"].map((copy) => (
        <span key={copy} className="invisible col-start-1 row-start-1">
          {copy}
        </span>
      ))}
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={label}
          className="col-start-1 row-start-1"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0, transition: spring.fast.exit }}
          transition={spring.moderate}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function FooterSlot({
  shown,
  children,
  className,
}: {
  shown: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      inert={!shown}
      className={cn(shown ? "" : "pointer-events-none", className)}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.96 }}
      transition={shown ? spring.moderate : spring.fast.exit}
    >
      {children}
    </motion.div>
  );
}

const fieldInset = (frameWidth: number) => (frameWidth < 400 ? PAD : 64);

export function OnboardingStepper({ competitors }: { competitors: readonly Competitor[] }) {
  const size = useSize();
  const shape = useShape();
  const titleId = useId();
  const frameRef = useRef<HTMLElement>(null);
  const [frameWidth, setFrameWidth] = useState(FRAME_WIDTH);

  const [{ phase, direction }, setFlow] = useState<{ phase: Phase; direction: 1 | -1 }>({
    phase: { kind: "step", step: 0 },
    direction: 1,
  });
  const [stage, setStage] = useState(0);
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [rivals, setRivals] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [refusal, setRefusal] = useState<{ text: string; isError: boolean } | null>(null);

  const domain = parseDomain(url);
  const favicon = useFavicon(domain, FAVICON_DEBOUNCE_MS);
  const progress = useMotionValue(0);

  const completed = useRef<{ site: string | null; rivals: string | null; lead: string | null }>({
    site: null,
    rivals: null,
    lead: null,
  });
  const failedGates = useRef(new Set<Gate>());
  const lastInput = useRef<"keyboard" | "pointer">("pointer");

  const fieldKick = useKick();
  const listKick = useKick();
  const countKick = useKick();
  const actionKick = useKick();

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const read = () => setFrameWidth(frame.offsetWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const go = useCallback((next: Phase, nextDirection: 1 | -1) => {
    setRefusal(null);
    setFlow({ phase: next, direction: nextDirection });
  }, []);

  const finishGate = useEffectEvent((gate: Gate) => {
    if (gate === "site") {
      completed.current.site = domain;
      const allowed = new Set(visibleCompetitors(competitors, domain).map((c) => c.domain));
      setRivals((picks) => picks.filter((pick) => allowed.has(pick)));
      go({ kind: "step", step: 1 }, 1);
    } else if (gate === "rivals") {
      const lead = rivals[0];
      setPrompts((picks) => reconcilePrompts(picks, completed.current.lead, lead));
      completed.current.lead = lead;
      completed.current.rivals = rivals.join();
      go({ kind: "step", step: 2 }, 1);
    } else {
      go({ kind: "done" }, 1);
    }
  });

  const failGate = useEffectEvent((gate: Gate) => {
    failedGates.current.add(gate);
    go({ kind: "loading", gate, failed: true }, 1);
  });

  const loadingGate = phase.kind === "loading" && !phase.failed ? phase.gate : null;

  useEffect(() => {
    if (!loadingGate) return;
    let cancelled = false;
    let controls: AnimationPlaybackControls | undefined;
    const pause = (seconds: number) =>
      new Promise((resolve) => setTimeout(resolve, (seconds / getMotionTuning().timeScale) * 1000));

    const run = async () => {
      const { stages } = GATES[loadingGate];
      setStage(0);
      controls = animate(progress, 0, spring.fast);
      // The ring starts counting once the tile has reached the center.
      await pause(getMotionTuning().slow.duration);
      if (cancelled) return;
      const failing = domain === FAILING_DOMAIN && !failedGates.current.has(loadingGate);
      const seconds = LOAD_SECONDS / stages.length;
      for (let index = 0; index < stages.length; index++) {
        const target = failing ? 0.62 / stages.length : (index + 1) / stages.length;
        const stageRun = animate(progress, target, {
          duration: seconds / getMotionTuning().timeScale,
          ease: "easeInOut",
        });
        controls = stageRun;
        await stageRun;
        if (cancelled) return;
        if (failing) {
          failGate(loadingGate);
          return;
        }
        await pause(STAGE_HOLD_SECONDS);
        if (cancelled) return;
        if (index < stages.length - 1) setStage(index + 1);
      }
      finishGate(loadingGate);
    };
    void run();
    return () => {
      cancelled = true;
      controls?.stop();
    };
    // `domain` is settled while a loader runs: the field isn't on screen to change it.
  }, [loadingGate, progress]);

  const refuseEmpty = () => {
    setRefusal({ text: "Pick at least one", isError: true });
    listKick.shake();
    countKick.pop(0.15);
  };

  const startGate = (gate: Gate) => {
    if (gate === "site") {
      // The next screen's logos are ready by the time the loader ends.
      for (const competitor of competitors) void loadFavicon(competitor.domain);
    }
    go({ kind: "loading", gate, failed: false }, 1);
  };

  const handleContinue = () => {
    if (phase.kind === "loading" && phase.failed) {
      go({ ...phase, failed: false }, 1);
      return;
    }
    if (phase.kind !== "step") return;
    if (phase.step === 0) {
      if (!domain) {
        setFieldError("Add a domain, like acme.com");
        fieldKick.shake();
        frameRef.current?.querySelector<HTMLElement>('[data-step-focus="0"]')?.focus();
        return;
      }
      if (completed.current.site === domain) go({ kind: "step", step: 1 }, 1);
      else startGate("site");
    } else if (phase.step === 1) {
      if (rivals.length === 0) return refuseEmpty();
      if (completed.current.rivals === rivals.join()) go({ kind: "step", step: 2 }, 1);
      else startGate("rivals");
    } else {
      if (prompts.length === 0) return refuseEmpty();
      startGate("finish");
    }
  };

  const canCancel = phase.kind === "loading" && (phase.gate !== "finish" || phase.failed);

  const handleBack = () => {
    if (phase.kind === "loading") {
      if (canCancel) go({ kind: "step", step: GATES[phase.gate].from }, -1);
    } else if (phase.kind === "step" && phase.step > 0) {
      go({ kind: "step", step: (phase.step - 1) as Step }, -1);
    }
  };

  const handleStartOver = () => {
    completed.current = { site: null, rivals: null, lead: null };
    failedGates.current.clear();
    progress.set(0);
    setUrl("");
    setFieldError(null);
    setRivals([]);
    setPrompts([]);
    go({ kind: "step", step: 0 }, -1);
  };

  const pickWith =
    (picks: readonly string[], setPicks: (next: string[]) => void) =>
    (id: string): PickOutcome => {
      const result = togglePick(picks, id, MAX_PICKS);
      if (result.outcome === "refused") {
        setRefusal({ text: `You can pick up to ${MAX_PICKS}`, isError: false });
        countKick.pop(0.15);
      } else {
        setRefusal(null);
        setPicks(result.picks);
      }
      return result.outcome;
    };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && canCancel && !event.defaultPrevented) {
      event.preventDefault();
      handleBack();
      return;
    }
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      phase.kind === "step" &&
      phase.step > 0
    ) {
      event.preventDefault();
      actionKick.press(0.95);
      handleContinue();
    }
  };

  // Focus follows the flow for a keyboard user. After a click, moving it would leave a ring on screen.
  const phaseKey =
    phase.kind === "step"
      ? `step-${phase.step}`
      : phase.kind === "loading"
        ? `loading-${phase.gate}-${phase.failed}`
        : "done";
  const previousPhaseKey = useRef(phaseKey);
  useEffect(() => {
    if (previousPhaseKey.current === phaseKey) return;
    previousPhaseKey.current = phaseKey;
    const frame = frameRef.current;
    if (!frame) return;
    const held = frame.contains(document.activeElement);
    if (phase.kind === "loading" && !phase.failed) {
      // The control that started this is going away, and Escape still has to reach the stepper.
      if (held || lastInput.current === "keyboard") frame.focus({ preventScroll: true });
      return;
    }
    if (lastInput.current === "keyboard" && held) {
      const target =
        phase.kind === "step"
          ? frame.querySelector<HTMLElement>(`[data-step-focus="${phase.step}"]`)
          : frame.querySelector<HTMLElement>("[data-action]");
      target?.focus({ preventScroll: true });
    } else if (document.activeElement === frame) {
      frame.blur();
    }
  }, [phase, phaseKey]);

  const showDocked = phase.kind === "step" && phase.step > 0;
  const fieldLeft = fieldInset(frameWidth);
  const tilePose =
    phase.kind === "step" && phase.step === 0
      ? { x: fieldLeft, y: FIELD_TOP, size: size.controlHeight, radius: shape.bgRadius }
      : showDocked
        ? { x: PAD, y: HEADER_TOP, size: HEADER_TILE, radius: nestedRadius(shape.bgRadius, 2) }
        : {
            x: (frameWidth - CENTER_TILE) / 2,
            y: phase.kind === "done" ? DONE_TILE_TOP : LOADING_TILE_TOP,
            size: CENTER_TILE,
            radius: shape.containerRadius + 2,
          };

  const currentStep: Step =
    phase.kind === "step" ? phase.step : phase.kind === "loading" ? GATES[phase.gate].from : 2;
  // A failed load holds its segment where it stopped, along with the ring.
  const followingSegment =
    phase.kind === "loading" && phase.gate !== "finish" ? currentStep + 1 : -1;

  const panelKey =
    phase.kind === "step" ? `step-${phase.step}` : phase.kind === "loading" ? "loading" : "done";
  const panelTop = HEADER_TOP + HEADER_TILE + 12;
  const panelBottom = 16 + size.controlHeight + 12;

  const rivalRows: RowData[] = visibleCompetitors(competitors, domain).map((competitor) => ({
    id: competitor.domain,
    label: competitor.name,
    logo: { domain: competitor.domain, name: competitor.name },
  }));
  const leadName = competitors.find((competitor) => competitor.domain === rivals[0])?.name ?? "";
  const promptRows: RowData[] = promptsFor(domain ?? "", leadName).map(({ id, text }) => ({
    id,
    label: text,
  }));

  const stageLabel = phase.kind === "loading" ? GATES[phase.gate].stages[stage] : "";
  const summary = `${plural(rivals.length, "competitor")} · ${plural(prompts.length, "prompt")}`;
  const announcement =
    phase.kind === "step"
      ? `Step ${phase.step + 1} of 3: ${STEP_TITLES[phase.step]}`
      : phase.kind === "loading"
        ? phase.failed
          ? ""
          : stageLabel
        : `You’re all set. ${summary}.`;

  const actionLabel =
    phase.kind === "loading" && phase.failed
      ? "Try again"
      : phase.kind === "step" && phase.step === 2
        ? "Submit"
        : "Continue";
  const actionShown = phase.kind === "step" || (phase.kind === "loading" && phase.failed);
  const backShown =
    (phase.kind === "step" && phase.step > 0) ||
    (phase.kind === "loading" && (phase.gate !== "finish" || phase.failed));
  const isListStep = phase.kind === "step" && phase.step > 0;
  const activeCount = phase.kind === "step" && phase.step === 2 ? prompts.length : rivals.length;

  const panelTransition = { ...spring.slow, delay: spring.moderate.exit.duration };
  const panelMotion = {
    initial: { x: direction * 28, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: {
      x: direction * -16,
      opacity: 0,
      pointerEvents: "none" as const,
      transition: spring.moderate.exit,
    },
    transition: panelTransition,
  };

  const titleClass = cn(size.type.display, "text-balance text-text-primary");
  const titleStyle = { fontVariationSettings: fontWeights.bold };

  const handleAction = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // A keyboard click reports no detail, and a pointer already presses through `whileTap`.
    if (event.detail === 0) actionKick.press(0.95);
    handleContinue();
  };

  return (
    <section
      ref={frameRef}
      tabIndex={-1}
      aria-label="Onboarding"
      onKeyDownCapture={() => {
        lastInput.current = "keyboard";
      }}
      onPointerDownCapture={() => {
        lastInput.current = "pointer";
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative mx-auto w-full overflow-hidden border border-border-default bg-bg-surface outline-none",
        shape.container,
      )}
      style={{ height: FRAME_HEIGHT, maxWidth: FRAME_WIDTH }}
    >
      <span role="status" className="sr-only">
        {announcement}
      </span>

      <div
        role="img"
        aria-label={`Step ${currentStep + 1} of 3`}
        className="absolute inset-x-6 z-10 flex items-center gap-1"
        style={{ top: 12, height: 20 }}
      >
        {[0, 1, 2].map((index) => (
          <Segment
            key={index}
            lit={phase.kind === "done" || index <= currentStep}
            following={index === followingSegment}
            progress={progress}
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {showDocked && (
          <motion.div
            key="identity"
            className={cn("absolute z-10 flex items-center text-text-primary", size.type.subtitle)}
            style={{
              top: HEADER_TOP,
              left: PAD + HEADER_TILE + 8,
              right: PAD,
              height: HEADER_TILE,
            }}
            initial={{ x: -6, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0, transition: spring.fast.exit }}
            transition={{ ...spring.moderate, delay: spring.slow.duration * 0.5 }}
          >
            <bdi title={domain ?? undefined} className="truncate">
              {domain}
            </bdi>
          </motion.div>
        )}
      </AnimatePresence>

      <Tile
        domain={domain}
        status={favicon}
        pose={tilePose}
        showRing={phase.kind === "loading"}
        progress={progress}
        failed={phase.kind === "loading" && phase.failed}
        done={phase.kind === "done"}
      />

      <AnimatePresence initial={false}>
        {panelKey === "step-0" && (
          <motion.div key="step-0" className="absolute inset-0" {...panelMotion}>
            <h2
              id={titleId}
              className={cn(titleClass, "absolute inset-x-6 text-center")}
              style={{ ...titleStyle, top: FIELD_TOP - 54 }}
            >
              {STEP_TITLES[0]}
            </h2>
            <UrlField
              value={url}
              onChange={(next) => {
                setUrl(next);
                setFieldError(null);
              }}
              onSubmit={() => {
                actionKick.press(0.95);
                handleContinue();
              }}
              error={fieldError}
              labelledBy={titleId}
              left={fieldLeft + size.controlHeight + 8}
              right={fieldLeft}
              top={FIELD_TOP}
              focusStep={0}
              kick={fieldKick}
            />
          </motion.div>
        )}

        {(panelKey === "step-1" || panelKey === "step-2") && (
          <motion.div
            key={panelKey}
            className="absolute inset-x-6 flex flex-col gap-3"
            style={{ top: panelTop, bottom: panelBottom }}
            {...panelMotion}
          >
            <h2 className={titleClass} style={titleStyle}>
              {STEP_TITLES[panelKey === "step-1" ? 1 : 2]}
            </h2>
            <motion.div className="flex min-h-0 flex-col" style={listKick.style}>
              {panelKey === "step-1" ? (
                <PickList
                  rows={rivalRows}
                  selected={rivals}
                  label={STEP_TITLES[1]}
                  focusStep={1}
                  onToggle={pickWith(rivals, setRivals)}
                />
              ) : (
                <PickList
                  rows={promptRows}
                  selected={prompts}
                  label={STEP_TITLES[2]}
                  focusStep={2}
                  onToggle={pickWith(prompts, setPrompts)}
                />
              )}
            </motion.div>
          </motion.div>
        )}

        {panelKey === "loading" && phase.kind === "loading" && (
          <motion.div
            key="loading"
            className="absolute inset-x-6 text-center"
            style={{ top: LOADING_TILE_TOP + CENTER_TILE + RING_GAP + 24 }}
            {...panelMotion}
          >
            {phase.failed ? (
              <div role="alert">
                <p
                  className={cn("text-text-primary", size.type.title)}
                  style={{ fontVariationSettings: fontWeights.semibold }}
                >
                  Couldn’t reach <bdi>{domain}</bdi>
                </p>
                <p className={cn("mt-1 text-text-secondary", size.type.body)}>
                  Check the address, then try again.
                </p>
              </div>
            ) : (
              <div
                aria-hidden
                className={cn("relative overflow-hidden text-text-primary", size.type.title)}
                style={{ fontVariationSettings: fontWeights.semibold }}
              >
                <span className="invisible">{stageLabel}</span>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={stageLabel}
                    className="absolute inset-x-0 top-0"
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -16, opacity: 0, transition: spring.moderate.exit }}
                    transition={spring.slow}
                  >
                    {stageLabel}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {panelKey === "done" && (
          <motion.div
            key="done"
            className="absolute inset-x-6 flex flex-col items-center text-center"
            style={{ top: DONE_TILE_TOP + CENTER_TILE + 28 }}
            {...panelMotion}
          >
            <h2 className={titleClass} style={titleStyle}>
              You’re all set
            </h2>
            <bdi
              title={domain ?? undefined}
              className={cn("mt-2 max-w-full truncate text-text-primary", size.type.subtitle)}
            >
              {domain}
            </bdi>
            <p className={cn("mt-1 text-text-secondary tabular-nums", size.type.body)}>{summary}</p>
            <Button variant="ghost" data-action className="mt-6" onClick={handleStartOver}>
              Start over
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn("absolute inset-x-6 bottom-4 z-10 flex items-center", size.gap)}>
        <FooterSlot shown={backShown}>
          <motion.div
            whileTap={{ scale: 0.97, transition: spring.fast }}
            // Motion makes a pressable element focusable. The button inside is the tab stop.
            tabIndex={-1}
            transition={hapticSpring()}
          >
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          </motion.div>
        </FooterSlot>

        <div className="relative flex min-w-0 flex-1 items-center justify-center">
          <AnimatePresence initial={false} mode="popLayout">
            {isListStep &&
              (refusal ? (
                <motion.span
                  key={refusal.text}
                  role={refusal.isError ? "alert" : "status"}
                  className={cn(
                    "whitespace-nowrap",
                    size.type.caption,
                    refusal.isError ? "text-danger-text" : "text-text-primary",
                  )}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -6, opacity: 0, transition: spring.fast.exit }}
                  transition={spring.moderate}
                >
                  {refusal.text}
                </motion.span>
              ) : (
                <motion.span
                  key="count"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: spring.fast.exit }}
                  transition={spring.moderate}
                >
                  <PickCount count={activeCount} kick={countKick} />
                </motion.span>
              ))}
          </AnimatePresence>
        </div>

        <FooterSlot shown={actionShown}>
          <motion.div
            style={actionKick.style}
            whileTap={{ scale: 0.95, transition: spring.fast }}
            // Motion makes a pressable element focusable. The button inside is the tab stop.
            tabIndex={-1}
            transition={hapticSpring()}
          >
            <Button data-action={actionShown ? "" : undefined} onClick={handleAction}>
              <ActionLabel label={actionLabel} />
            </Button>
          </motion.div>
        </FooterSlot>
      </div>
    </section>
  );
}
