"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useShape } from "@/lib/shape-context";
import { useSizeVariant } from "@/lib/size-context";

// ---------------------------------------------------------------------------
// Badge is a short label for status, category or metadata, in 2 variants:
//   solid: a light tint of the color behind foreground text.
//   dot:   a neutral outline and foreground text; only the dot is colored.
// Each color is a single token. The solid tint is mixed against the page
// background at render time, so the same token works in light and dark themes.
// ---------------------------------------------------------------------------

// One category token per hue. Text never takes the hue:
// it stays on the primary text color, so it keeps its contrast on every color.
// `accent` is the app's accent (--color-accent-solid),
// for marks like New that should follow the brand color.
const badgeColors = {
  accent: "var(--color-accent-solid)",
  gray: "var(--color-category-gray)",
  red: "var(--color-category-red)",
  orange: "var(--color-category-orange)",
  amber: "var(--color-category-amber)",
  yellow: "var(--color-category-yellow)",
  lime: "var(--color-category-lime)",
  green: "var(--color-category-green)",
  emerald: "var(--color-category-emerald)",
  teal: "var(--color-category-teal)",
  cyan: "var(--color-category-cyan)",
  blue: "var(--color-category-blue)",
  indigo: "var(--color-category-indigo)",
  violet: "var(--color-category-violet)",
  purple: "var(--color-category-purple)",
  fuchsia: "var(--color-category-fuchsia)",
  pink: "var(--color-category-pink)",
  rose: "var(--color-category-rose)",
} as const;

type BadgeColor = keyof typeof badgeColors;

const badgeVariants = cva("inline-flex items-center whitespace-nowrap", {
  variants: {
    variant: {
      solid: "",
      dot: "border border-border-default text-text-primary",
    },
    // The two-step size ladder shared by every control: 24px tall by
    // default, 20px compact. The height is fixed rather than padded so the
    // trimmed label below can't shrink the badge.
    size: {
      default:
        "h-6 px-2.5 text-[length:var(--fs-caption,12px)] leading-[var(--lh-caption,16px)] gap-1.5",
      compact:
        "h-5 px-2 text-[length:var(--fs-caption-compact,11px)] leading-[var(--lh-caption-compact,14px)] gap-1",
    },
  },
  defaultVariants: {
    variant: "solid",
    size: "default",
  },
});

type BadgeSizeCanonical = "default" | "compact";

/** Public size values: the canonical two-size scale plus the pre-sizes-system
 *  aliases, kept so existing call sites keep compiling. Aliases resolve onto
 *  the canonical ladder (sm → compact; md/lg → default). */
type BadgeSize = BadgeSizeCanonical | "sm" | "md" | "lg";

const legacySizeAliases: Partial<Record<BadgeSize, BadgeSizeCanonical>> = {
  sm: "compact",
  md: "default",
  lg: "default",
};

interface BadgeProps
  extends
    Omit<HTMLAttributes<HTMLSpanElement>, "color">,
    Omit<VariantProps<typeof badgeVariants>, "size"> {
  color?: BadgeColor;
  /** Omitted, the badge follows the surrounding SizeProvider. Legacy
   *  sm/md/lg values still resolve. */
  size?: BadgeSize;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { className, variant = "solid", size: sizeProp, color = "gray", children, style, ...props },
    ref,
  ) => {
    // Corner radius comes from the shape context (pill or rounded), so
    // badges follow the rest of the app instead of hard-coding a radius.
    const shape = useShape();
    // Resolve the size: explicit prop (legacy aliases mapped onto the
    // canonical ladder) > surrounding SizeProvider > default.
    const contextSize = useSizeVariant();
    const size: BadgeSizeCanonical = sizeProp
      ? (legacySizeAliases[sizeProp] ?? (sizeProp as BadgeSizeCanonical))
      : contextSize === "compact"
        ? "compact"
        : "default";
    const colorValue = badgeColors[color];
    const isSolid = variant === "solid";
    const dotSize = size === "compact" ? 6 : 7;

    // 15% of the hue mixed into the page background: a tint that sits at the
    // right depth in either theme, under plain foreground text. Gray skips
    // the mix and takes the theme's neutral fill (`--accent`), so a gray
    // badge matches the other neutral fills around it.
    const colorStyle = isSolid
      ? color === "gray"
        ? { backgroundColor: "var(--color-bg-active)", color: "var(--color-text-primary)" }
        : {
            color: "var(--color-text-primary)",
            backgroundColor: `color-mix(in srgb, ${colorValue} 15%, var(--color-bg-nested))`,
          }
      : {};

    // The dot carries the full-strength color. Gray uses the theme's muted text
    // color instead, so the neutral dot stays visible in both themes.
    const dotColor = color === "gray" ? "var(--color-text-secondary)" : colorValue;

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), shape.item, className)}
        style={{ ...colorStyle, ...style }}
        {...props}
      >
        {!isSolid && (
          <span
            className="shrink-0 rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              backgroundColor: dotColor,
            }}
          />
        )}
        {/* text-box needs a block container. The badge root is a flex
            container, so the label gets its own span. Height is fixed (h-*),
            so trimming only recenters the letterforms. */}
        <span className="[text-box:trim-both_cap_alphabetic]">{children}</span>
      </span>
    );
  },
);

Badge.displayName = "Badge";

export { Badge, badgeVariants, badgeColors };
export type { BadgeProps, BadgeColor, BadgeSize };
