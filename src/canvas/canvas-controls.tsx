import { motion, useReducedMotionConfig } from "motion/react";
import {
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover";
import { useSurfaceMorph } from "@/hooks/use-surface-morph";
import { useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
import { useShape, useShapeContext } from "@/lib/shape-context";
import { useSize, useSizeContext } from "@/lib/size-context";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

import type { CanvasController } from "./controller";
import { FineTuneToggle, INSPECT_WIDTH, Inspector } from "./inspector/inspector";
import { ACCENTS, type Accent, type Preferences, THEMES, type Theme } from "./layout-storage";
import type { CanvasEntry } from "./registry";
import { SEARCH_WIDTH, SearchField, SearchResults, useCanvasSearch } from "./search";

type RegisterItem = (index: number, element: HTMLElement | null) => void;

type ToolButtonProps = ComponentPropsWithRef<typeof motion.button> & {
  index: number;
  registerItem: RegisterItem;
  label: string;
  selected?: boolean;
  wide?: boolean;
};

function ToolButton({
  index,
  registerItem,
  label,
  selected,
  wide,
  className,
  ref,
  ...rest
}: ToolButtonProps) {
  const shape = useShape();
  const { controlHeight } = useSize();
  const inner = useRef<HTMLButtonElement>(null);
  useRegisterFluidHoverItem(registerItem, index, inner);

  return (
    <motion.button
      type="button"
      {...pressMotion(0.86)}
      aria-label={label}
      {...rest}
      ref={(element) => {
        inner.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      style={{ width: wide ? controlHeight + 20 : controlHeight, height: controlHeight }}
      className={cn(
        "relative flex shrink-0 items-center justify-center text-text-primary transition-colors duration-[var(--spring-moderate,160ms)]",
        shape.bg,
        selected && "bg-bg-active",
        className,
      )}
    />
  );
}

/** One fluid hover highlight per group of alternatives. */
function useToolGroup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(containerRef, { axis: "x" });
  return { containerRef, hover };
}

function ToolGroup({
  label,
  actions,
}: {
  label: string;
  actions: {
    label: string;
    hint?: string;
    icon: ReactNode;
    onClick: () => void;
    selected?: boolean;
    wide?: boolean;
    buttonRef?: Ref<HTMLButtonElement>;
  }[];
}) {
  const shape = useShape();
  const { containerRef, hover } = useToolGroup();

  return (
    <div
      ref={containerRef}
      {...hover.handlers}
      role="group"
      aria-label={label}
      className="relative flex items-center"
    >
      <FluidHoverHighlight hover={hover} className={shape.bg} />
      {actions.map((action, index) => (
        <Tooltip key={action.label} content={hintedLabel(action.label, action.hint)} side="top">
          <ToolButton
            index={index}
            registerItem={hover.registerItem}
            label={action.label}
            onClick={action.onClick}
            selected={action.selected}
            aria-pressed={action.selected}
            ref={action.buttonRef}
          >
            {action.icon}
          </ToolButton>
        </Tooltip>
      ))}
    </div>
  );
}

function hintedLabel(label: string, hint?: string) {
  if (!hint) return label;
  return (
    <>
      {label}
      <span className="ml-1.5 opacity-60">{hint}</span>
    </>
  );
}

type Option<T extends string> = { value: T; label: string; glyph: ReactNode };

/**
 * One strip holding every option, clipped to a single slot at rest. Opening widens the clip and
 * slides the strip, so nothing swaps, scales, or leaves the flow.
 */
function Picker<T extends string>({
  label,
  value,
  options,
  open,
  onOpenChange,
  onSelect,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: T) => void;
}) {
  const { controlHeight } = useSize();
  const shape = useShape();
  const { containerRef, hover } = useToolGroup();
  const optionRefs = useRef(new Map<T, HTMLButtonElement>());
  const wasOpen = useRef(open);
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  // Width is a layout property, which MotionConfig's reduced motion doesn't cover by itself.
  const reduceMotion = useReducedMotionConfig();
  const transition = reduceMotion ? { duration: 0 } : spring.moderate;

  useEffect(() => {
    const current = optionRefs.current.get(value);
    if (open && !wasOpen.current) current?.focus({ preventScroll: true });
    if (!open && wasOpen.current && containerRef.current?.contains(document.activeElement)) {
      current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open, value, containerRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = options[(currentIndex + step + options.length) % options.length];
    if (!next) return;
    onSelect(next.value);
    optionRefs.current.get(next.value)?.focus({ preventScroll: true });
  };

  return (
    <motion.div
      initial={false}
      animate={{ width: open ? controlHeight * options.length : controlHeight }}
      transition={transition}
      style={{ height: controlHeight }}
      // The margin keeps a focus ring visible past the clip.
      className={cn("shrink-0 overflow-clip [overflow-clip-margin:3px]", shape.bg)}
    >
      <motion.div
        ref={containerRef}
        {...hover.handlers}
        role={open ? "radiogroup" : undefined}
        aria-label={open ? label : undefined}
        onKeyDown={onKeyDown}
        initial={false}
        animate={{ x: open ? 0 : -currentIndex * controlHeight }}
        transition={transition}
        className="relative flex w-max"
      >
        {/* Slides to whatever was picked, so the change itself shows what is selected. */}
        <motion.span
          aria-hidden
          data-slot="picker-selection"
          className={cn("absolute top-0 left-0 bg-bg-active", shape.bg)}
          style={{ width: controlHeight, height: controlHeight }}
          initial={false}
          animate={{ x: currentIndex * controlHeight, opacity: open ? 1 : 0 }}
          transition={transition}
        />
        <FluidHoverHighlight hover={hover} className={shape.bg} />
        {options.map((option, index) => {
          const isCurrent = option.value === value;
          const reachable = open || isCurrent;
          return (
            <Tooltip key={option.value} content={open ? option.label : label} side="top">
              <ToolButton
                index={index}
                registerItem={hover.registerItem}
                label={open ? option.label : `${label}: ${option.label}`}
                role={open ? "radio" : undefined}
                aria-checked={open ? isCurrent : undefined}
                aria-expanded={open ? undefined : false}
                aria-hidden={reachable ? undefined : true}
                inert={!reachable}
                tabIndex={isCurrent ? 0 : -1}
                ref={(element) => {
                  if (element) optionRefs.current.set(option.value, element);
                  else optionRefs.current.delete(option.value);
                }}
                // Stays open so options can be compared. Clicking the current one closes it.
                onClick={() => {
                  if (!open) onOpenChange(true);
                  else if (isCurrent) onOpenChange(false);
                  else onSelect(option.value);
                }}
              >
                <span
                  className={cn(
                    "flex transition-colors duration-[var(--spring-moderate,160ms)]",
                    !open || isCurrent ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  {option.glyph}
                </span>
              </ToolButton>
            </Tooltip>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

const ACCENT_LABELS: Record<Accent, string> = {
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
  orange: "Orange",
  green: "Green",
  teal: "Teal",
  none: "No accent",
};

function Swatch({ accent }: { accent: Accent }) {
  if (accent === "none") {
    return <span className="size-3.5 rounded-full border border-border-strong" />;
  }
  return (
    <span
      className="size-3.5 rounded-full"
      style={{ backgroundColor: `var(--color-swatch-${accent})` }}
    />
  );
}

/** The surface's padding on both sides of its bottom row. */
const ROW_PADDING = 8;

const Divider = () => <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-bg-selected" />;

type PickerName = "theme" | "accent";
type View = "settings" | "search";

const VIEW_WIDTHS: Record<View, string> = { settings: INSPECT_WIDTH, search: SEARCH_WIDTH };

/** What shows in each view. The rest of the surface's contents give way as it morphs. */
const MORPH_LAYERS = {
  zoom: [null],
  find: [null, "search"],
  kept: [null, "settings"],
  settings: ["settings"],
  search: ["search"],
} as const satisfies Record<string, readonly (View | null)[]>;

const SEARCH_HINT =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

/** Falls back to the physical key only for a layout that doesn't type a Latin letter there. */
const isSearchShortcut = (event: globalThis.KeyboardEvent) =>
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  (event.key.toLowerCase() === "k" || (!/^[a-z0-9]$/i.test(event.key) && event.code === "KeyK"));

export function CanvasControls({
  controller,
  entries,
}: {
  controller: CanvasController;
  entries: readonly CanvasEntry[];
}) {
  const icons = useIcons();
  const shapeClasses = useShape();
  const { icon: glyph, controlHeight } = useSize();
  const { setShape } = useShapeContext();
  const { setSize } = useSizeContext();
  const [preferences, setPreferences] = useState(controller.currentPreferences);
  const [openPicker, setOpenPicker] = useState<PickerName | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [fineTuning, setFineTuning] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const inspectRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const focusBeforeSearch = useRef<Element | null>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const keptRef = useRef<HTMLDivElement>(null);
  const { rendered } = useSurfaceMorph<View>({
    view,
    surfaceRef,
    regionRef,
    widths: VIEW_WIDTHS,
    // Both keep their natural width while the surface resizes, so this stays true mid-morph.
    restingWidth: () =>
      (leadRef.current?.offsetWidth ?? 0) + (keptRef.current?.offsetWidth ?? 0) + ROW_PADDING,
    layers: MORPH_LAYERS,
  });
  const morphed = rendered.length > 0;

  const openSearch = () => {
    focusBeforeSearch.current = document.activeElement;
    setOpenPicker(null);
    setView("search");
  };
  // Back to wherever the keyboard was, since nothing on the canvas takes focus by itself.
  const closeSearch = () => {
    setView(null);
    const previous = focusBeforeSearch.current;
    if (previous instanceof HTMLElement && previous !== document.body) {
      previous.focus({ preventScroll: true });
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
  const search = useCanvasSearch({
    entries,
    open: view === "search",
    onPick: (entry) => {
      setView(null);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      controller.focusItem(entry.id);
    },
  });

  const { Search, Minus, Plus, Maximize, Sun, Moon, Monitor, Settings } = {
    Search: icons.search,
    Minus: icons.minus,
    Plus: icons.plus,
    Maximize: icons.maximize,
    Sun: icons.sun,
    Moon: icons.moon,
    Monitor: icons.monitor,
    Settings: icons.settings,
  };

  useEffect(() => {
    if (!openPicker) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolbarRef.current?.contains(event.target)) {
        setOpenPicker(null);
      }
    };
    // Capture, because an open tooltip on the focused option would otherwise swallow Escape.
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // React rerenders between listeners, so Inspect can't tell from state that this Escape is taken.
      event.preventDefault();
      setOpenPicker(null);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [openPicker]);

  useEffect(() => {
    if (!view) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (view === "search") {
        closeSearch();
      } else {
        setView(null);
        inspectRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [view]);

  // Search is a passing visit. Settings stay open, so a setting can be felt on real items.
  useEffect(() => {
    if (view !== "search") return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !surfaceRef.current?.contains(event.target)) {
        setView(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [view]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      if (view === "search") closeSearch();
      else openSearch();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view]);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    controller.setPreference(key, value);
    setPreferences((current) => ({ ...current, [key]: value }));
    if (key === "shape") setShape(value as Preferences["shape"]);
    if (key === "density") setSize(value as Preferences["density"]);
  };

  const pickerProps = (name: PickerName) => ({
    open: openPicker === name,
    onOpenChange: (next: boolean) => setOpenPicker(next ? name : null),
  });

  const themeGlyphs: Record<Theme, ReactNode> = {
    light: <Sun size={glyph} />,
    // A crescent carries more visual mass than a sun at the same size, so it is drawn a step smaller.
    dark: <Moon size={glyph - 1} />,
    system: <Monitor size={glyph} />,
  };
  const themeLabels: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };

  return (
    <TooltipProvider delayDuration={400}>
      <div
        data-canvas-overlay
        className="pointer-events-none fixed bottom-4 left-4 z-10 max-w-[calc(100vw-2rem)] *:pointer-events-auto"
      >
        {/* One surface: the toolbar doesn't open a panel, it becomes one. */}
        <div
          ref={surfaceRef}
          style={{ borderRadius: shapeClasses.containerRadius }}
          className="group/surface flex w-max max-w-full flex-col overflow-clip bg-bg-raised shadow-surface-4"
        >
          {morphed && (
            // Contained, so a panel's width never counts toward the resting toolbar's. The views share
            // one cell, so two can cross while a morph goes straight from one to the other.
            <div
              ref={regionRef}
              className="grid content-end items-end justify-items-start overflow-clip [contain:inline-size] *:[grid-area:1/1]"
            >
              {rendered.includes("settings") && (
                <Inspector
                  preferences={preferences}
                  onChange={update}
                  fineTuning={fineTuning}
                  active={view === "settings"}
                />
              )}
              {rendered.includes("search") && (
                <SearchResults search={search} active={view === "search"} />
              )}
            </div>
          )}
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label="Canvas controls"
            className={cn("relative flex items-center p-1", !morphed && "flex-wrap")}
          >
            {/* With no basis once morphed, an open picker never squeezes what stays. */}
            <div className={cn("min-w-0 grow", morphed && "basis-0")}>
              <div ref={leadRef} className="flex w-max items-center">
                {/* Stays under the cursor through the morph, so the glyph becomes the field's. */}
                <div inert={view === "settings"} style={{ opacity: "var(--morph-find, 1)" }}>
                  <ToolGroup
                    label="Search"
                    actions={[
                      {
                        label: "Search",
                        hint: SEARCH_HINT,
                        icon: <Search size={glyph} />,
                        onClick: () => (view === "search" ? closeSearch() : openSearch()),
                        buttonRef: searchButtonRef,
                      },
                    ]}
                  />
                </div>
                <div
                  inert={view !== null}
                  style={{ opacity: "var(--morph-zoom, 1)" }}
                  className="flex items-center group-data-morphing/surface:pointer-events-none"
                >
                  <Divider />
                  <ToolGroup
                    label="Zoom"
                    actions={[
                      {
                        label: "Zoom out",
                        hint: "−",
                        icon: <Minus size={glyph} />,
                        onClick: controller.zoomOut,
                      },
                      {
                        label: "Reset camera",
                        hint: "0",
                        wide: true,
                        icon: (
                          <span
                            ref={controller.attachZoomOutput}
                            className="text-caption text-text-secondary tabular-nums"
                          />
                        ),
                        onClick: controller.resetView,
                      },
                      {
                        label: "Zoom in",
                        hint: "+",
                        icon: <Plus size={glyph} />,
                        onClick: controller.zoomIn,
                      },
                      {
                        label: "Fit all",
                        hint: "1",
                        icon: <Maximize size={glyph} />,
                        onClick: controller.fitAll,
                      },
                    ]}
                  />
                  <Divider />
                </div>
              </div>
            </div>
            {rendered.includes("search") && (
              <div
                style={{
                  left: controlHeight + 8,
                  opacity: "var(--morph-search, 0)",
                }}
                className="absolute inset-y-1 right-1"
              >
                <SearchField search={search} active={view === "search"} />
              </div>
            )}
            {rendered.includes("settings") && (
              <div
                inert={view !== "settings" || openPicker !== null}
                style={{ opacity: "var(--morph-settings, 0)" }}
                className="absolute inset-y-1 left-2 flex items-center"
              >
                {/* An open picker needs this part of the row. */}
                <motion.div
                  initial={false}
                  animate={{ opacity: openPicker ? 0 : 1 }}
                  transition={openPicker ? spring.moderate.exit : spring.moderate}
                >
                  <FineTuneToggle
                    open={fineTuning}
                    onToggle={() => setFineTuning((open) => !open)}
                  />
                </motion.div>
              </div>
            )}
            {/* Stays through the morph as one group, riding the surface's corner. */}
            <div
              ref={keptRef}
              inert={view === "search"}
              style={{ opacity: "var(--morph-kept, 1)" }}
              className="flex min-w-0 flex-wrap items-center justify-end"
            >
              {/* The group slides away mid-morph, so a second click can't land on whatever arrives. */}
              <div className="flex flex-wrap items-center group-data-morphing/surface:pointer-events-none">
                <Picker
                  label="Theme"
                  value={preferences.theme}
                  options={THEMES.map((value) => ({
                    value,
                    label: themeLabels[value],
                    glyph: themeGlyphs[value],
                  }))}
                  onSelect={(value) => update("theme", value)}
                  {...pickerProps("theme")}
                />
                <Picker
                  label="Accent"
                  value={preferences.accent}
                  options={ACCENTS.map((value) => ({
                    value,
                    label: ACCENT_LABELS[value],
                    glyph: <Swatch accent={value} />,
                  }))}
                  onSelect={(value) => update("accent", value)}
                  {...pickerProps("accent")}
                />
              </div>
              <Divider />
              <ToolGroup
                label="Inspect"
                actions={[
                  {
                    label: "Inspect",
                    icon: <Settings size={glyph} />,
                    onClick: () => {
                      setOpenPicker(null);
                      setView((current) => (current === "settings" ? null : "settings"));
                    },
                    selected: view === "settings",
                    buttonRef: inspectRef,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
