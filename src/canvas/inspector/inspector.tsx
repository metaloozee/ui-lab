import { motion, useReducedMotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { SelfFluidHoverLayer, useSelfFluidHover } from "@/components/self-fluid-hover";
import { useIcons } from "@/lib/icon-context";
import { pressMotion } from "@/lib/press";
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

export const INSPECT_WIDTH = "min(23rem, calc(100vw - 2rem))";
const FINE_TUNE_ID = "inspect-fine-tune";

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
        // The margin leaves room for a value line this row shows in its own column.
        className="mb-0"
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

/** Sits in the surface's bottom row, so the springs it reveals open upward, directly above it. */
export function FineTuneToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const self = useSelfFluidHover<HTMLButtonElement>();
  const Chevron = useIcons()["chevron-right"];

  return (
    <motion.button
      ref={self.ref}
      type="button"
      aria-expanded={open}
      aria-controls={FINE_TUNE_ID}
      {...pressMotion(0.98)}
      {...self.hover.handlers}
      onClick={onToggle}
      className="relative flex h-8 items-center gap-1 rounded-lg px-1 text-caption text-text-secondary"
    >
      <SelfFluidHoverLayer self={self} />
      <motion.span
        className="relative flex"
        animate={{ rotate: open ? -90 : 0 }}
        transition={spring.moderate}
      >
        <Chevron size={14} />
      </motion.span>
      <span className="relative">Fine-tune springs</span>
    </motion.button>
  );
}

function FineTune({
  open,
  tuning,
  onChange,
}: {
  open: boolean;
  tuning: MotionTuning;
  onChange: (next: MotionTuning) => void;
}) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const reduceMotion = useReducedMotionConfig();

  const setTier = (tier: SpringTier, patch: Partial<SpringValues>) =>
    onChange({ ...tuning, [tier]: { ...tuning[tier], ...patch } });

  const seconds = (value: number) => `${value.toFixed(2)}s`;
  // Height is a layout property, which MotionConfig's reduced motion doesn't cover by itself.
  const instant = { duration: 0 };
  const transition = open ? spring.moderate : spring.moderate.exit;

  // The sliders are slow to mount. On the click, that freeze would spend half the spring unseen, so
  // they mount ahead of time, once the panel's own morph has finished.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (mounted) return;
    const timer = window.setTimeout(() => setMounted(true), spring.slow.duration * 2000);
    return () => window.clearTimeout(timer);
  }, [mounted]);

  return (
    <motion.div
      id={FINE_TUNE_ID}
      inert={!open}
      initial={false}
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      transition={reduceMotion ? instant : transition}
      // Cancels the parent's gap while closed, so a collapsed panel keeps its height.
      className="-mt-2 overflow-hidden"
    >
      {mounted && (
        <div className="flex flex-col gap-3 pt-4">
          {SPRING_TIERS.map((tier) => {
            const values = tuning[tier];
            return (
              <section key={tier} className="flex flex-col gap-1">
                <h3 className="text-caption font-medium text-text-primary">{TIER_LABELS[tier]}</h3>
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
      )}
    </motion.div>
  );
}

/** One page of settings, applied live across the canvas. */
export function Inspector({
  preferences,
  onChange,
  fineTuning,
  active,
}: {
  preferences: Preferences;
  onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  fineTuning: boolean;
  active: boolean;
}) {
  const { motion: tuning } = preferences;
  const panelRef = useRef<HTMLElement>(null);
  const feel = feelOf(tuning);

  const setMotion = (next: MotionTuning) => onChange("motion", next);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      data-focus-landing=""
      aria-label="Inspect"
      data-morph-panel="settings"
      inert={!active}
      style={{ width: INSPECT_WIDTH, opacity: "var(--morph-settings, 0)" }}
      className="flex flex-none flex-col outline-none"
    >
      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="scroll-fade max-h-[calc(100dvh-7rem)] [&>*]:!min-w-0"
      >
        <div className="flex flex-col gap-2 px-3 pt-3 pb-1">
          <Choice<Feel>
            label="Feel"
            value={feel}
            options={feel === "custom" ? [...FEELS, { value: "custom", label: "Custom" }] : FEELS}
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
          <FineTune open={fineTuning} tuning={tuning} onChange={setMotion} />
        </div>
      </ScrollArea>
    </section>
  );
}
