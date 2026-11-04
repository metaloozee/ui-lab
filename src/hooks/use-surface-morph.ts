import { animate, useReducedMotionConfig } from "motion/react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { spring } from "@/lib/springs";

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Turns one surface into any of several larger views and back: the surface itself resizes, so its
 * shadow and corners stay real and nothing scales. `regionRef` wraps the views, each marked
 * `data-morph-panel`, and must clip them and hold them to the bottom edge.
 *
 * Each layer names the views it shows in and reads its opacity as `--morph-<layer>`. A layer shown on
 * both sides of a morph never dips. Every morph starts from where the surface is right now, so an
 * interrupted one turns around without a jump. At rest the sizes go back to CSS, so changes inside a
 * view still flow. `data-morphing` marks the surface until the pointer can trust what's under it.
 */
export function useSurfaceMorph<View extends string>({
  view,
  surfaceRef,
  regionRef,
  widths,
  restingWidth,
  layers,
}: {
  view: View | null;
  surfaceRef: RefObject<HTMLElement | null>;
  regionRef: RefObject<HTMLElement | null>;
  /** CSS widths, since the surface returns to them at rest. */
  widths: Record<View, string>;
  /** Read every frame, so resting content that's still settling can't cause a jump at the end. */
  restingWidth: () => number;
  layers: Record<string, readonly (View | null)[]>;
}) {
  const [rendered, setRendered] = useState<readonly View[]>([]);
  if (view && !rendered.includes(view)) setRendered([...rendered, view]);

  const reduceMotion = useReducedMotionConfig();
  const atRest = useRef(true);
  const previous = useRef<View | null>(null);
  const height = useRef(0);
  const fades = useRef(
    Object.fromEntries(
      Object.entries(layers).map(([name, views]) => [name, views.includes(null) ? 1 : 0]),
    ),
  );

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const region = regionRef.current;
    if (!surface || !region) return;
    const panel = view && region.querySelector<HTMLElement>(`[data-morph-panel="${view}"]`);
    if (view && !panel) return;

    // Measured at the start of every morph, because a view can change size while it rests.
    const fromWidth = surface.offsetWidth;
    // A panel arriving has already stretched the region, so a resting one measures itself.
    const resting =
      atRest.current && previous.current
        ? region.querySelector<HTMLElement>(`[data-morph-panel="${previous.current}"]`)
        : null;
    const fromHeight = resting ? resting.offsetHeight : height.current;
    previous.current = view;
    const fromFades = { ...fades.current };
    let fullWidth = 0;
    if (view) {
      surface.style.width = widths[view];
      fullWidth = surface.offsetWidth;
    }
    const toHeight = panel ? panel.offsetHeight : 0;
    atRest.current = false;

    const paint = (progress: number) => {
      // Width and height are layout properties, which MotionConfig's reduced motion doesn't cover.
      const size = reduceMotion ? 1 : progress;
      // Closing never swells toward resting content that's wider for now, like an open picker.
      const toWidth = view ? fullWidth : Math.min(restingWidth(), fromWidth);
      surface.style.width = `${mix(fromWidth, toWidth, size)}px`;
      height.current = mix(fromHeight, toHeight, size);
      region.style.height = `${height.current}px`;
      for (const [name, views] of Object.entries(layers)) {
        const from = fromFades[name] ?? 0;
        const fade = views.includes(view)
          ? // What arrives waits until there's room for it.
            mix(from, 1, clamp01((progress - 0.35) / 0.45))
          : from * clamp01(1 - progress / 0.35);
        fades.current[name] = fade;
        surface.style.setProperty(`--morph-${name}`, String(fade));
      }
    };
    paint(0);
    surface.dataset.morphing = "";
    const settle = () => delete surface.dataset.morphing;

    const animation = animate(0, 1, {
      ...(reduceMotion
        ? spring.fast
        : view
          ? { type: "spring" as const, duration: spring.slow.duration, bounce: spring.slow.bounce }
          : { duration: spring.slow.exit.duration, ease: [0.4, 0, 0.2, 1] as const }),
      onUpdate: paint,
      onComplete: () => {
        paint(1);
        atRest.current = true;
        if (view) {
          surface.style.width = widths[view];
          // The old view has to be gone first, or it stretches the released region for a frame.
          flushSync(() => setRendered([view]));
          region.style.height = "";
          // Whatever slid under a resting cursor hasn't been pointed at yet, so it waits for a move.
          // Touch has no cursor, and its next tap would be lost.
          if (window.matchMedia("(hover: hover)").matches) {
            window.addEventListener("pointermove", settle, { once: true });
          } else {
            settle();
          }
        } else {
          settle();
          surface.style.width = "";
          height.current = 0;
          setRendered([]);
        }
      },
    });
    return () => {
      animation.stop();
      window.removeEventListener("pointermove", settle);
    };
    // Everything else is read when a morph starts. Changing it mid-morph shouldn't restart one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return { rendered };
}
