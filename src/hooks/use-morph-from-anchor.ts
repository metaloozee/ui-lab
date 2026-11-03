import { animate, usePresence, useReducedMotionConfig } from "motion/react";
import { type RefObject, useLayoutEffect, useRef } from "react";

import { useShape } from "@/lib/shape-context";
import { spring } from "@/lib/springs";

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Makes a popover grow out of its trigger and collapse back into it. It moves and clips the real
 * surface instead of scaling it, so contents never stretch. One progress value drives everything,
 * so the shape can't drift apart and an interrupted morph reverses from where it is. Render inside
 * `AnimatePresence`, with `contentRef` around what should fade through the morph.
 */
export function useMorphFromAnchor(
  surfaceRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  anchorRef: RefObject<HTMLElement | null>,
) {
  const [isPresent, safeToRemove] = usePresence();
  const reduceMotion = useReducedMotionConfig();
  const { bgRadius, containerRadius } = useShape();
  const progress = useRef(0);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const content = contentRef.current;
    const anchor = anchorRef.current;
    if (!surface || !content) return;

    const target = isPresent ? 1 : 0;
    const finish = () => {
      if (!isPresent) safeToRemove?.();
    };

    if (reduceMotion || !anchor) {
      surface.style.clipPath = "none";
      surface.style.transform = "none";
      content.style.opacity = "1";
      const fade = animate(surface, { opacity: target }, spring.fast);
      progress.current = target;
      void fade.then(finish);
      return () => fade.stop();
    }

    // Measured at the start of every morph, because the panel's height can change while open.
    surface.style.transform = "none";
    const home = surface.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = surface;
    const button = anchor.getBoundingClientRect();
    const closedX = Math.max(0, button.right - (home.left + width));
    const closedY = button.bottom - (home.top + height);
    const closedLeft = button.left - (home.left + closedX);
    const closedTop = button.top - (home.top + closedY);
    const closedRight = width - closedLeft - button.width;

    const paint = (value: number) => {
      progress.current = value;
      surface.style.transform = `translate(${mix(closedX, 0, value)}px, ${mix(closedY, 0, value)}px)`;
      surface.style.clipPath = `inset(${mix(closedTop, 0, value)}px ${mix(closedRight, 0, value)}px 0px ${mix(closedLeft, 0, value)}px round ${mix(bgRadius, containerRadius, clamp01(value))}px)`;
      // The surface takes over from the real button at the very start and hands back at the end.
      surface.style.opacity = String(clamp01(value / 0.12));
      // Contents appear only once there's room for them.
      content.style.opacity = String(clamp01((value - 0.35) / 0.45));
    };
    paint(progress.current);

    const animation = animate(progress.current, target, {
      ...(isPresent
        ? { type: "spring" as const, duration: spring.slow.duration, bounce: spring.slow.bounce }
        : { duration: spring.slow.exit.duration, ease: [0.4, 0, 0.2, 1] as const }),
      onUpdate: paint,
      onComplete: () => {
        paint(target);
        if (isPresent) {
          // Without the clip, the panel's own radius follows the Corners setting from here on.
          surface.style.clipPath = "none";
          surface.style.transform = "none";
        }
        finish();
      },
    });
    return () => animation.stop();
    // Everything else is read when a morph starts. Changing it mid-morph shouldn't restart one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);
}
