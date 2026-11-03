import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { SelfFluidHoverLayer, useSelfFluidHover } from "@/components/self-fluid-hover";
import { useMorphFromAnchor } from "@/hooks/use-morph-from-anchor";
import { useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
import { useShape } from "@/lib/shape-context";
import {
  DEFAULT_MOTION,
  type MotionTuning,
  type ReducedMotion,
  spring,
  SPRING_TIERS,
  type SpringTier,
  type SpringValues,
} from "@/lib/springs";

import { Choice } from "../controls";
import type { Preferences } from "../layout-storage";
import { copyMotionTokens, FEELS, type Feel, feelOf, withFeel } from "./feel";

const TIER_LABELS: Record<SpringTier, string> = {
  fast: "Small moves",
  moderate: "Medium moves",
  slow: "Large moves",
};

const REDUCED: readonly { value: ReducedMotion; label: string }[] = [
  { value: "user", label: "System" },
  { value: "always", label: "On" },
  { value: "never", label: "Off" },
];

const SPEEDS = [
  { value: "1", label: "1×" },
  { value: "0.5", label: "½×" },
  { value: "0.25", label: "¼×" },
] as const;

function TuningRow({
  label,
  value,
  min,
  max,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr_2.75rem] items-center gap-2">
      <span className="text-caption text-text-secondary">{label}</span>
      <Slider
        size="compact"
        label={label}
        showValue={false}
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(next) => onChange(next as number)}
      />
      <span className="text-right text-caption text-text-secondary tabular-nums">
        {format(value)}
      </span>
    </div>
  );
}

function FineTune({
  tuning,
  onChange,
}: {
  tuning: MotionTuning;
  onChange: (next: MotionTuning) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const self = useSelfFluidHover<HTMLButtonElement>();
  const reduceMotion = useReducedMotionConfig();
  const Chevron = useIcons()["chevron-right"];
  const bodyId = useId();

  const setTier = (tier: SpringTier, patch: Partial<SpringValues>) =>
    onChange({ ...tuning, [tier]: { ...tuning[tier], ...patch } });

  const seconds = (value: number) => `${value.toFixed(2)}s`;
  // Height is a layout property, which MotionConfig's reduced motion doesn't cover by itself.
  const transition = reduceMotion ? { duration: 0 } : spring.moderate;

  return (
    <div className="flex flex-col">
      <motion.button
        ref={self.ref}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        {...pressMotion(0.98)}
        {...self.hover.handlers}
        onClick={() => setOpen(!open)}
        className="relative flex h-8 items-center gap-1 rounded-lg px-1 text-caption text-text-secondary"
      >
        <SelfFluidHoverLayer self={self} />
        <motion.span
          className="relative flex"
          animate={{ rotate: open ? 90 : 0 }}
          transition={spring.moderate}
        >
          <Chevron size={14} />
        </motion.span>
        <span className="relative">Fine-tune springs</span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: reduceMotion ? { duration: 0 } : spring.moderate.exit,
            }}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-2">
              {SPRING_TIERS.map((tier) => {
                const values = tuning[tier];
                return (
                  <section key={tier} className="flex flex-col gap-1">
                    <h3 className="text-caption font-medium text-text-primary">
                      {TIER_LABELS[tier]}
                    </h3>
                    <TuningRow
                      label="Time"
                      value={values.duration}
                      min={0.02}
                      max={1.2}
                      format={seconds}
                      onChange={(duration) => setTier(tier, { duration })}
                    />
                    <TuningRow
                      label="Bounce"
                      value={values.bounce}
                      min={0}
                      max={0.6}
                      format={(value) => value.toFixed(2)}
                      onChange={(bounce) => setTier(tier, { bounce })}
                    />
                    <TuningRow
                      label="Exit"
                      value={values.exit}
                      min={0.02}
                      max={0.8}
                      format={seconds}
                      onChange={(exit) => setTier(tier, { exit })}
                    />
                  </section>
                );
              })}
              <Choice
                label="Reduced motion"
                value={tuning.reducedMotion}
                options={REDUCED}
                onChange={(reducedMotion) => onChange({ ...tuning, reducedMotion })}
              />
              <div className="flex items-center justify-end gap-2">
                <span role="status" className="mr-auto text-caption text-text-secondary">
                  {copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy" : ""}
                </span>
                <Button size="compact" variant="ghost" onClick={() => onChange(DEFAULT_MOTION)}>
                  Reset
                </Button>
                <Button
                  size="compact"
                  variant="tertiary"
                  onClick={() => {
                    void copyMotionTokens(tuning).then(setCopied);
                  }}
                >
                  Copy values
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One page of settings, applied live across the canvas. */
export function Inspector({
  preferences,
  onChange,
  anchorRef,
}: {
  preferences: Preferences;
  onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const shape = useShape();
  const { motion: tuning } = preferences;
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const feel = feelOf(tuning);
  useMorphFromAnchor(panelRef, contentRef, anchorRef);

  const setMotion = (next: MotionTuning) => onChange("motion", next);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    // The shadow sits on a parent, because the morph's clip would cut off the panel's own.
    <div className="floating-shadow max-w-full">
      <section
        ref={panelRef}
        tabIndex={-1}
        aria-label="Inspect"
        style={{ borderRadius: shape.containerRadius }}
        className="flex max-h-[calc(100dvh-7rem)] w-[23rem] max-w-full flex-col overflow-hidden bg-bg-raised ring-1 ring-border-default ring-inset outline-none"
      >
        <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
          <ScrollArea
            className="min-h-0 flex-1"
            viewportClassName="max-h-[calc(100dvh-7rem)] [&>*]:!min-w-0"
          >
            <div className="flex flex-col gap-2 p-3">
              <Choice<Feel>
                label="Feel"
                value={feel}
                options={
                  feel === "custom" ? [...FEELS, { value: "custom", label: "Custom" }] : FEELS
                }
                onChange={(next) => {
                  if (next !== "custom") setMotion(withFeel(tuning, next));
                }}
              />
              <Choice
                label="Speed"
                value={String(tuning.timeScale)}
                options={SPEEDS}
                onChange={(value) => setMotion({ ...tuning, timeScale: Number(value) })}
              />
              <Choice
                label="Corners"
                value={preferences.shape}
                options={[
                  { value: "rounded", label: "Rounded" },
                  { value: "pill", label: "Pill" },
                ]}
                onChange={(value) => onChange("shape", value)}
              />
              <Choice
                label="Size"
                value={preferences.density}
                options={[
                  { value: "default", label: "Regular" },
                  { value: "compact", label: "Compact" },
                ]}
                onChange={(value) => onChange("density", value)}
              />
              <FineTune tuning={tuning} onChange={setMotion} />
            </div>
          </ScrollArea>
        </div>
      </section>
    </div>
  );
}
