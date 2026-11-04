import { type KeyboardEvent, memo, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "motion/react";

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover";
import { useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
import { spring } from "@/lib/springs";
import { useShape } from "@/lib/shape-context";
import { cn } from "@/lib/utils";

import type { CanvasController } from "./controller";
import { ErrorBoundary } from "./error-boundary";
import { copyItemPrompt } from "./prompt";
import type { CanvasEntry } from "./registry";

const NUDGE_STEP = 8;
const NUDGE_STEP_LARGE = 64;
const COPIED_MS = 1400;
const HINTS = { idle: "Copy prompt", copied: "Prompt copied", failed: "Couldn't copy" };

function CopyableName({
  entry,
  index,
  registerItem,
}: {
  entry: CanvasEntry;
  index: number;
  registerItem: (index: number, element: HTMLElement | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useRegisterFluidHoverItem(registerItem, index, buttonRef);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    let result: "copied" | "failed" = "copied";
    try {
      await copyItemPrompt(entry);
    } catch {
      result = "failed";
    }
    setStatus(result);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), COPIED_MS);
  };

  return (
    <span className="group/name relative flex items-center">
      <motion.button
        ref={buttonRef}
        {...pressMotion(0.96)}
        type="button"
        onClick={() => void copy()}
        className="relative cursor-default rounded-sm px-1 text-xs font-medium whitespace-nowrap text-text-secondary outline-none data-fluid-hover-active:text-text-primary focus-visible:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {entry.name}
      </motion.button>
      <span
        aria-hidden
        data-visible={status !== "idle" || undefined}
        className="pointer-events-none absolute top-1/2 left-full ml-1 -translate-y-1/2 text-xs whitespace-nowrap text-text-secondary opacity-0 transition-opacity duration-[var(--spring-fast,80ms)] group-hover/name:opacity-100 group-focus-within/name:opacity-100 data-visible:opacity-100"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={status}
            className="inline-block"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: spring.fast.exit }}
            transition={spring.moderate}
          >
            {HINTS[status]}
          </motion.span>
        </AnimatePresence>
      </span>
      <span role="status" className="sr-only">
        {status === "idle" ? "" : `${HINTS[status]}: ${entry.name}`}
      </span>
    </span>
  );
}

function ItemChrome({ entry, controller }: { entry: CanvasEntry; controller: CanvasController }) {
  const Grip = useIcons()["grip-vertical"];
  const rowRef = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(rowRef, { axis: "x", gapClick: false });
  const handleRef = useRef<HTMLButtonElement>(null);
  useRegisterFluidHoverItem(hover.registerItem, 0, handleRef);
  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    controller.nudgeItem(entry.id, move[0], move[1]);
  };

  return (
    <div
      ref={(element) => {
        rowRef.current = element;
        return element ? controller.attachChrome(entry.id, element) : undefined;
      }}
      {...hover.handlers}
      data-canvas-surface=""
      // Above every preview, so an overlapped item can still be grabbed.
      style={{ zIndex: 1_000_000 }}
      className="absolute top-0 left-0 flex items-center gap-0.5 pb-1.5"
    >
      <FluidHoverHighlight hover={hover} className="rounded-sm" />
      <motion.button
        ref={handleRef}
        {...pressMotion(0.85)}
        type="button"
        data-canvas-handle={entry.id}
        aria-label={`Move ${entry.name}`}
        aria-describedby="canvas-move-instructions"
        onKeyDown={onHandleKeyDown}
        className="relative flex size-5 cursor-grab touch-none items-center justify-center rounded-sm text-text-secondary outline-none data-fluid-hover-active:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <Grip size={14} />
      </motion.button>
      <CopyableName entry={entry} index={1} registerItem={hover.registerItem} />
    </div>
  );
}

export const CanvasItem = memo(function CanvasItem({
  entry,
  controller,
}: {
  entry: CanvasEntry;
  controller: CanvasController;
}) {
  const shape = useShape();

  return (
    <>
      <ItemChrome entry={entry} controller={controller} />
      <div
        ref={(element) => (element ? controller.attachFrame(entry.id, element) : undefined)}
        style={{ width: entry.width, height: entry.height }}
        className={cn(
          "canvas-frame absolute top-0 left-0 bg-bg-surface ring-1 ring-border-default",
          shape.container,
        )}
      >
        <ErrorBoundary
          fallback={
            <div role="alert" className="p-3 text-sm text-danger-text">
              {entry.name} crashed. See the console.
            </div>
          }
        >
          {entry.render()}
        </ErrorBoundary>
      </div>
    </>
  );
});
