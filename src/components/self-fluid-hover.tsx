import { type HTMLAttributes, type MouseEvent, type Ref, useCallback, useRef } from "react";

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover";
import { cn } from "@/lib/utils";

const HOVER_OPTIONS = { nearest: true, gapClick: false } as const;

/**
 * Fluid hover for a control that stands alone: the control is its own one-item list. It needs a
 * positioned root, with `SelfFluidHoverLayer` before content that is itself positioned.
 */
export function useSelfFluidHover<T extends HTMLElement>(outerRef?: Ref<T>) {
  const containerRef = useRef<T>(null);
  const targetRef = useRef<HTMLSpanElement>(null);
  const hover = useFluidHover(containerRef, HOVER_OPTIONS);
  useRegisterFluidHoverItem(hover.registerItem, 0, targetRef);

  const ref = useCallback(
    (element: T | null) => {
      containerRef.current = element;
      if (typeof outerRef === "function") outerRef(element);
      else if (outerRef) outerRef.current = element;
    },
    [outerRef],
  );

  return { ref, targetRef, hover };
}

export function SelfFluidHoverLayer({
  self,
  className,
}: {
  self:
    | ReturnType<typeof useSelfFluidHover<never>>
    | Pick<ReturnType<typeof useSelfFluidHover>, "targetRef" | "hover">;
  className?: string;
}) {
  return (
    <>
      <span ref={self.targetRef} aria-hidden className="pointer-events-none absolute inset-0" />
      <FluidHoverHighlight hover={self.hover} className={cn("rounded-[inherit]", className)} />
    </>
  );
}

type MouseHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  "onMouseEnter" | "onMouseMove" | "onMouseLeave"
>;

/** Keeps handlers the caller passed, such as a tooltip trigger's, alongside the hover ones. */
export function mergeFluidHoverHandlers(
  handlers: MouseHandlers,
  props: MouseHandlers,
): MouseHandlers {
  const merge = (key: keyof MouseHandlers) => (event: MouseEvent<HTMLElement>) => {
    handlers[key]?.(event);
    props[key]?.(event);
  };
  return {
    onMouseEnter: merge("onMouseEnter"),
    onMouseMove: merge("onMouseMove"),
    onMouseLeave: merge("onMouseLeave"),
  };
}
