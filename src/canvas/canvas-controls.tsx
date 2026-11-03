import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
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
import { useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
import { useShape, useShapeContext } from "@/lib/shape-context";
import { useSize, useSizeContext } from "@/lib/size-context";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

import type { CanvasController } from "./controller";
import { Inspector } from "./inspector/inspector";
import { ACCENTS, type Accent, type Preferences, THEMES, type Theme } from "./layout-storage";

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
        "relative flex shrink-0 items-center justify-center text-text-primary",
        shape.bg,
        selected && "bg-bg-selected",
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
          className={cn("absolute top-0 left-0 bg-bg-selected", shape.bg)}
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

const Divider = () => <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-bg-selected" />;

type PickerName = "theme" | "accent";

export function CanvasControls({ controller }: { controller: CanvasController }) {
  const icons = useIcons();
  const shapeClasses = useShape();
  const { icon: glyph } = useSize();
  const { setShape } = useShapeContext();
  const { setSize } = useSizeContext();
  const [preferences, setPreferences] = useState(controller.currentPreferences);
  const [openPicker, setOpenPicker] = useState<PickerName | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const inspectRef = useRef<HTMLButtonElement>(null);

  const { Minus, Plus, Maximize, Sun, Moon, Monitor, Settings } = {
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
      if (event.key === "Escape") setOpenPicker(null);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [openPicker]);

  useEffect(() => {
    if (!inspecting) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || openPicker) return;
      setInspecting(false);
      inspectRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inspecting, openPicker]);

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
        className="pointer-events-none fixed bottom-4 left-4 z-10 flex max-w-[calc(100vw-2rem)] flex-col-reverse items-start gap-2 *:pointer-events-auto"
      >
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Canvas controls"
          style={{ borderRadius: shapeClasses.containerRadius }}
          className="flex flex-wrap items-center bg-bg-raised p-1 shadow-surface-4"
        >
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
          <Divider />
          <ToolGroup
            label="Inspect"
            actions={[
              {
                label: "Inspect",
                icon: <Settings size={glyph} />,
                onClick: () => setInspecting((open) => !open),
                selected: inspecting,
                buttonRef: inspectRef,
              },
            ]}
          />
        </div>
        <AnimatePresence>
          {inspecting && (
            <Inspector preferences={preferences} onChange={update} anchorRef={inspectRef} />
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
