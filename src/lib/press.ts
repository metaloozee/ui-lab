import { spring } from "@/lib/springs";

/**
 * The press every interactive element gets: spread onto a `motion.*` element. Read at render, so
 * it follows the Inspect panel, and `MotionConfig` drops it for reduced motion.
 */
export const pressMotion = (scale = 0.92) => ({
  whileTap: { scale },
  transition: spring.fast,
});
