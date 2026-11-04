import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { motion, useReducedMotionConfig } from "motion/react";

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight";
import { mergeFluidHoverHandlers, useSelfFluidHover } from "@/components/self-fluid-hover";
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover";
import { fontWeights } from "@/lib/font-weight";
import { pressMotion } from "@/lib/press";
import { nestedRadius, useShape } from "@/lib/shape-context";
import { useSize } from "@/lib/size-context";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

const STAGE_WIDTH = 320;
const CARD_WIDTH = 288;
const CARD_HEIGHT = 182;
const CARD_LEFT = (STAGE_WIDTH - CARD_WIDTH) / 2;
const HOLDER_HEIGHT = 172;
const NOTCH_WIDTH = 64;
const NOTCH_DEPTH = 14;

const PADDING = 16;
/** How much of each card shows once risen: enough for its name and a comfortable target. */
const BAND = 42;
const FRONT_BAND = 50;
const REST_PEEK = 10;
const REST_STEP = 8;
const FRONT_SCALE = 0.92;
const SCALE_STEP = 0.03;
const OPEN_GAP = 24;
const HOLDER_RECEDED = 0.8;
const LIFT = 4;

/** Rising cards fall in one after another, front first. */
const STAGGER = 0.04;
/** A pointer that slips off the wallet for a moment shouldn't collapse it. */
const LEAVE_GRACE_MS = 120;

type Rect = { top: number; left: number; width: number; height: number };
type Pose = { y: number; scale: number };

/** Every position the wallet takes, in stage coordinates. A card's `y` is its top edge. */
export function walletLayout(count: number) {
  const fanLip = PADDING + BAND * Math.max(0, count - 1) + FRONT_BAND;
  const openHeight = CARD_HEIGHT + OPEN_GAP + HOLDER_HEIGHT * HOLDER_RECEDED;
  const stageHeight = Math.max(fanLip + HOLDER_HEIGHT, PADDING + openHeight) + PADDING;
  const depth = (index: number) => count - 1 - index;
  const cardScale = (index: number) => FRONT_SCALE - depth(index) * SCALE_STEP;

  const restHeight = REST_PEEK + REST_STEP * Math.max(0, count - 1) + HOLDER_HEIGHT;
  const restTop = Math.round((stageHeight - restHeight) / 2);
  const restLip = restTop + restHeight - HOLDER_HEIGHT;

  const openTop = Math.round((stageHeight - openHeight) / 2);
  const openLip = openTop + CARD_HEIGHT + OPEN_GAP;

  return {
    stageHeight,
    holder: {
      rest: { y: restLip, scale: 1 },
      fan: { y: fanLip, scale: 1 },
      open: { y: openLip, scale: HOLDER_RECEDED },
    } satisfies Record<string, Pose>,
    /** Where the pointer counts as being on the wallet. Rest sits wholly inside fan, so a wallet that rises never lets go of the pointer that raised it. */
    hitArea: {
      rest: { top: restTop, left: CARD_LEFT, width: CARD_WIDTH, height: restHeight },
      fan: {
        top: PADDING,
        left: CARD_LEFT,
        width: CARD_WIDTH,
        height: stageHeight - 2 * PADDING,
      },
      open: { top: 0, left: 0, width: STAGE_WIDTH, height: stageHeight },
    } satisfies Record<string, Rect>,
    card: {
      rest: (index: number): Pose => ({
        y: restLip - REST_PEEK - depth(index) * REST_STEP,
        scale: cardScale(index),
      }),
      fan: (index: number): Pose => ({ y: PADDING + index * BAND, scale: cardScale(index) }),
      open: (): Pose => ({ y: openTop, scale: 1 }),
      tucked: (index: number): Pose => ({
        y: openLip - 4 - depth(index) * 4,
        scale: cardScale(index) * HOLDER_RECEDED,
      }),
    },
  };
}

/* oxlint-disable ui-lab/design-tokens -- The cards and their leather holder are physical objects whose color is the subject. They read the same in both themes, and every ink is measured against its fill. */
const TONES = {
  graphite: {
    fill: "linear-gradient(135deg in oklab, oklch(0.39 0.008 260), oklch(0.33 0.008 260) 55%, oklch(0.28 0.008 260))",
    ink: "oklch(0.97 0.006 260)",
    inkSoft: "oklch(0.84 0.012 260)",
  },
  ultramarine: {
    fill: "linear-gradient(135deg in oklab, oklch(0.44 0.13 268), oklch(0.38 0.12 268) 55%, oklch(0.32 0.11 268))",
    ink: "oklch(0.97 0.012 268)",
    inkSoft: "oklch(0.85 0.04 268)",
  },
  forest: {
    fill: "linear-gradient(135deg in oklab, oklch(0.44 0.08 165), oklch(0.38 0.07 165) 55%, oklch(0.32 0.06 165))",
    ink: "oklch(0.97 0.012 165)",
    inkSoft: "oklch(0.85 0.04 165)",
  },
  terracotta: {
    fill: "linear-gradient(135deg in oklab, oklch(0.49 0.12 40), oklch(0.42 0.11 40) 55%, oklch(0.36 0.1 40))",
    ink: "oklch(0.97 0.014 40)",
    inkSoft: "oklch(0.88 0.04 40)",
  },
} as const;

const CARD_EDGE =
  "inset 0 0 0 1px oklch(1 0 0 / 0.08), inset 0 1px 0 oklch(1 0 0 / 0.12), 0 -1px 3px oklch(0 0 0 / 0.22)";
const SHEEN = "oklch(1 0 0 / 0.1)";
const FOCUS_RING = "oklch(1 0 0 / 0.95)";
const CHIP = "linear-gradient(135deg in oklab, oklch(0.88 0.06 85), oklch(0.72 0.08 80))";
const CHIP_LINE = "oklch(0.45 0.05 75 / 0.55)";
const LEATHER = {
  top: "oklch(0.36 0.035 55)",
  bottom: "oklch(0.29 0.03 55)",
  rim: "oklch(0.44 0.035 60)",
  groove: "oklch(0.2 0.015 55 / 0.55)",
  thread: "oklch(0.7 0.075 75)",
  deboss: "oklch(0.21 0.015 55 / 0.8)",
  debossLight: "oklch(0.5 0.025 60 / 0.35)",
  shadow: "drop-shadow(0 -1px 3px oklch(0 0 0 / 0.28)) drop-shadow(0 6px 10px oklch(0 0 0 / 0.16))",
};
/* oxlint-enable ui-lab/design-tokens */

export type WalletCardTone = keyof typeof TONES;

export type WalletCard = {
  id: string;
  issuer: string;
  tone: WalletCardTone;
  lastFour: string;
  cardholder: string;
  expiry: string;
};

const describeCard = (card: WalletCard) =>
  `${card.issuer} card ending ${card.lastFour}, ${card.cardholder}, expires ${card.expiry}`;

/** The pocket's outline: square to its corners, with a thumb notch dipping from the middle of its lip. */
function holderPath(radius: number) {
  const width = CARD_WIDTH - 1;
  const height = HOLDER_HEIGHT - 1;
  const middle = width / 2;
  const half = NOTCH_WIDTH / 2;
  const notch = [
    `L ${middle - half} 0`,
    `C ${middle - half * 0.5} 0 ${middle - half * 0.55} ${NOTCH_DEPTH} ${middle} ${NOTCH_DEPTH}`,
    `C ${middle + half * 0.55} ${NOTCH_DEPTH} ${middle + half * 0.5} 0 ${middle + half} 0`,
  ];
  return [
    `M ${radius} 0`,
    ...notch,
    `L ${width - radius} 0`,
    `A ${radius} ${radius} 0 0 1 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `A ${radius} ${radius} 0 0 1 ${width - radius} ${height}`,
    `L ${radius} ${height}`,
    `A ${radius} ${radius} 0 0 1 0 ${height - radius}`,
    `L 0 ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${radius} 0`,
    "Z",
  ].join(" ");
}

/** Stitching runs down the sides and along the bottom. The folded lip carries none, as on a real pocket. */
function stitchPath(radius: number) {
  const inset = 8;
  const left = inset;
  const right = CARD_WIDTH - 1 - inset;
  const bottom = HOLDER_HEIGHT - 1 - inset;
  const inner = nestedRadius(radius, inset);
  return [
    `M ${left} 14`,
    `L ${left} ${bottom - inner}`,
    `A ${inner} ${inner} 0 0 0 ${left + inner} ${bottom}`,
    `L ${right - inner} ${bottom}`,
    `A ${inner} ${inner} 0 0 0 ${right} ${bottom - inner}`,
    `L ${right} 14`,
  ].join(" ");
}

function HolderBody({ radius, monogram }: { radius: number; monogram?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const outline = holderPath(radius);
  const stitches = stitchPath(radius);
  const textProps = {
    x: (CARD_WIDTH - 1) / 2,
    textAnchor: "middle",
    fontSize: 11,
    letterSpacing: 0.4,
    style: { fontVariationSettings: fontWeights.semibold },
  } as const;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-hide`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={LEATHER.top} />
          <stop offset="1" stopColor={LEATHER.bottom} />
        </linearGradient>
        {/* Noise lit from the top left reads as pebbled grain rather than speckle. */}
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="7" />
          <feDiffuseLighting surfaceScale="1" diffuseConstant="0.8" lightingColor="white">
            <feDistantLight azimuth="235" elevation="60" />
          </feDiffuseLighting>
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      {/* The leather takes the pointer, so nothing behind it lights or opens. The notch stays open to the card. */}
      <path d={outline} fill={`url(#${id}-hide)`} pointerEvents="auto" />
      <path
        d={outline}
        fill="white"
        filter={`url(#${id}-grain)`}
        opacity={0.5}
        style={{ mixBlendMode: "soft-light" }}
      />
      {monogram && (
        <>
          <text {...textProps} y={HOLDER_HEIGHT - 23.3} fill={LEATHER.debossLight}>
            {monogram}
          </text>
          <text {...textProps} y={HOLDER_HEIGHT - 24} fill={LEATHER.deboss}>
            {monogram}
          </text>
        </>
      )}
      <path d={stitches} fill="none" stroke={LEATHER.groove} strokeWidth={2.5} />
      <path
        d={stitches}
        fill="none"
        stroke={LEATHER.thread}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeDasharray="4.5 3.5"
      />
      <path d={outline} fill="none" stroke={LEATHER.rim} />
    </>
  );
}

function CardFace({ card }: { card: WalletCard }) {
  const size = useSize();
  const tone = TONES[card.tone];
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex flex-col px-4 pt-3 pb-3.5 text-start"
      style={{ color: tone.ink }}
    >
      <span className="flex items-center justify-between gap-3">
        <span
          title={card.issuer}
          className={cn("truncate", size.type.subtitle)}
          style={{ fontVariationSettings: fontWeights.semibold }}
        >
          {card.issuer}
        </span>
        <svg width="28" height="18" viewBox="0 0 28 18" fill="none" className="shrink-0">
          <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="19" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <span
        className="absolute top-16 left-4 block h-7 w-9 overflow-hidden rounded-[5px]"
        style={{ background: CHIP }}
      >
        <span
          className="absolute inset-x-0 top-1/3 h-px"
          style={{ backgroundColor: CHIP_LINE, boxShadow: `0 9px 0 ${CHIP_LINE}` }}
        />
        <span
          className="absolute inset-y-0 left-1/3 w-px"
          style={{ backgroundColor: CHIP_LINE, boxShadow: `11px 0 0 ${CHIP_LINE}` }}
        />
      </span>
      <span className={cn("mt-auto font-mono whitespace-nowrap tabular-nums", size.type.title)}>
        •••• •••• •••• {card.lastFour}
      </span>
      <span
        className={cn("mt-1 flex items-baseline justify-between gap-3", size.type.caption)}
        style={{ color: tone.inkSoft }}
      >
        <span title={card.cardholder} className="truncate">
          {card.cardholder}
        </span>
        <span className="shrink-0 tabular-nums">{card.expiry}</span>
      </span>
    </span>
  );
}

function CardItem({
  card,
  index,
  pose,
  arrival,
  lifted,
  lit,
  session,
  isOpen,
  dimmed,
  reachable,
  tabbable,
  radius,
  registerItem,
  onToggle,
}: {
  card: WalletCard;
  index: number;
  pose: Pose;
  arrival: object;
  lifted: boolean;
  lit: boolean;
  session: number;
  isOpen: boolean;
  dimmed: boolean;
  reachable: boolean;
  tabbable: boolean;
  radius: number;
  registerItem: (index: number, element: HTMLElement | null) => void;
  onToggle: (index: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useRegisterFluidHoverItem(registerItem, index, ref);

  return (
    <motion.div
      initial={false}
      animate={{ ...pose, opacity: dimmed ? 0 : 1 }}
      transition={arrival}
      className={cn("absolute top-0", reachable ? "pointer-events-auto" : "pointer-events-none")}
      style={{
        left: CARD_LEFT,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        zIndex: index + 1,
        transformOrigin: "50% 0%",
      }}
    >
      <motion.button
        ref={ref}
        {...pressMotion(0.98)}
        type="button"
        data-card={index}
        tabIndex={tabbable ? 0 : -1}
        aria-label={describeCard(card)}
        aria-expanded={isOpen}
        onClick={() => onToggle(index)}
        animate={{ y: lifted ? -LIFT : 0 }}
        className="relative block size-full cursor-pointer outline-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-solid focus-visible:outline-[var(--wallet-focus)]"
        style={{
          borderRadius: radius,
          background: TONES[card.tone].fill,
          boxShadow: CARD_EDGE,
        }}
      >
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: isOpen ? 1 : 0 }}
          transition={arrival}
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-surface-6"
        />
        {/* Lives on the card, so it lights every visible part of it and the stack still covers the rest. */}
        <FluidHoverHighlight
          rect={lit ? { top: 0, left: 0, width: CARD_WIDTH, height: CARD_HEIGHT } : null}
          session={session}
          className="rounded-[inherit] bg-[var(--wallet-sheen)]"
        />
        <CardFace card={card} />
      </motion.button>
    </motion.div>
  );
}

export function Wallet({ cards }: { cards: readonly WalletCard[] }) {
  const shape = useShape();
  const reduceMotion = useReducedMotionConfig() ?? false;
  const layout = useMemo(() => walletLayout(cards.length), [cards.length]);

  const rootRef = useRef<HTMLDivElement>(null);
  const wallet = useSelfFluidHover<HTMLDivElement>(rootRef);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const isOpen = openIndex !== null;

  const bands = useFluidHover(rootRef, { gapClick: false });
  const hovering = wallet.hover.activeIndex !== null;
  const [held, setHeld] = useState(false);
  if (hovering && !held) setHeld(true);
  useEffect(() => {
    if (hovering || !held) return;
    const timer = window.setTimeout(() => setHeld(false), LEAVE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [hovering, held]);

  const fanned = held || revealed;
  const state = isOpen ? "open" : fanned ? "fan" : "rest";

  // The hover and keyboard lift share one card, and the pointer wins.
  const [keyboardCard, setKeyboardCard] = useState<number | null>(null);
  const [tabStop, setTabStop] = useState(0);
  const activeCard = state === "fan" ? (bands.activeIndex ?? keyboardCard) : null;

  const focusCard = (index: number) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-card="${index}"]`)?.focus();

  const close = (returnFocus: boolean) => {
    if (openIndex === null) return;
    setOpenIndex(null);
    if (returnFocus) focusCard(openIndex);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // Capture, so Escape closes the card before the canvas toolbar can read it as its own.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current(rootRef.current?.contains(document.activeElement) ?? false);
    };
    // Waits for the click instead of the press, so the press that closes the card can't also land
    // on a card that has come back under the pointer.
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-card]")) return;
      closeRef.current(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [isOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isOpen || !(event.target instanceof HTMLElement)) return;
    const current = Number(event.target.dataset.card);
    if (Number.isNaN(current)) return;
    const last = cards.length - 1;
    const targets: Record<string, number> = {
      ArrowUp: Math.max(0, current - 1),
      ArrowDown: Math.min(last, current + 1),
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusCard(target);
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const index = Number(event.target.dataset.card);
    if (Number.isNaN(index)) return;
    setTabStop(index);
    // A pointer already reveals on hover, so only keyboard focus raises and lifts cards.
    if (event.target.matches(":focus-visible")) {
      setRevealed(true);
      setKeyboardCard(index);
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    setKeyboardCard(null);
    if (!event.currentTarget.contains(event.relatedTarget)) setRevealed(false);
  };

  const toggle = (index: number) => {
    setTabStop(index);
    setOpenIndex((current) => (current === index ? null : index));
  };

  const hoverHandlers = mergeFluidHoverHandlers(wallet.hover.handlers, bands.handlers);

  // Read at render, so these follow Feel and Speed. Cards carry more distance and weight than a
  // panel of the same tier, so they run longer: a touch of settle going out, none going home.
  const rising = { ...spring.slow, duration: spring.slow.duration * 1.5 };
  const settling = { ...spring.slow, duration: spring.slow.duration * 1.25, bounce: 0 };

  const poseFor = (index: number): Pose => {
    if (openIndex === index) return layout.card.open();
    if (isOpen) return layout.card.tucked(index);
    return fanned ? layout.card.fan(index) : layout.card.rest(index);
  };
  const arrivalFor = (index: number) => {
    if (state === "open") return rising;
    if (state === "rest") return settling;
    return { ...rising, delay: reduceMotion ? 0 : (cards.length - 1 - index) * STAGGER };
  };

  const openCard = openIndex === null ? undefined : cards[openIndex];

  return (
    <div
      ref={wallet.ref}
      {...hoverHandlers}
      role="group"
      aria-label="Wallet"
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className="pointer-events-none relative mx-auto"
      style={
        {
          width: STAGE_WIDTH,
          height: layout.stageHeight,
          "--wallet-focus": FOCUS_RING,
          "--wallet-sheen": SHEEN,
        } as React.CSSProperties
      }
    >
      <span ref={wallet.targetRef} aria-hidden className="absolute inset-0" />
      <div className="pointer-events-auto absolute" style={layout.hitArea[state]} />

      {cards.map((card, index) => (
        <CardItem
          key={card.id}
          card={card}
          index={index}
          pose={poseFor(index)}
          arrival={arrivalFor(index)}
          lifted={activeCard === index}
          lit={state === "fan" && bands.activeIndex === index}
          session={bands.session}
          isOpen={openIndex === index}
          dimmed={reduceMotion && isOpen && openIndex !== index}
          reachable={isOpen ? openIndex === index : fanned}
          tabbable={isOpen ? openIndex === index : tabStop === index}
          radius={shape.containerRadius}
          registerItem={bands.registerItem}
          onToggle={toggle}
        />
      ))}

      <motion.svg
        aria-hidden
        initial={false}
        animate={layout.holder[state]}
        transition={state === "rest" ? settling : rising}
        width={CARD_WIDTH}
        height={HOLDER_HEIGHT}
        viewBox={`-0.5 -0.5 ${CARD_WIDTH} ${HOLDER_HEIGHT}`}
        className="pointer-events-none absolute top-0"
        style={{
          left: CARD_LEFT,
          zIndex: cards.length + 1,
          transformOrigin: "50% 0%",
          filter: LEATHER.shadow,
        }}
      >
        <HolderBody radius={shape.containerRadius} monogram={cards[0]?.cardholder} />
      </motion.svg>

      <span role="status" className="sr-only">
        {openCard ? `${openCard.issuer} card open, ending ${openCard.lastFour}` : ""}
      </span>
    </div>
  );
}
