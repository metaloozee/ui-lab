#!/usr/bin/env node
// Measures color pairs and builds OKLCH ramps, so no value in a report is estimated by eye.

const HELP = `Usage:
  color.mjs contrast <foreground> <background>   WCAG 2 ratio and APCA Lc for a pair
  color.mjs ramp <hue> [--chroma 0.8] [--steps 11]   An OKLCH ramp at one hue

Colors are oklch(L C H), oklch(L C H / A), #rgb, or #rrggbb. L may be 0-1 or a percentage.`;

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchToLinear({ l, c, h }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = l + 0.3963377774 * a + 0.2158037573 * b;
  const M = l - 0.1055613458 * a - 0.0638541728 * b;
  const S = l - 0.0894841775 * a - 1.291485548 * b;
  return [
    4.0767416621 * L ** 3 - 3.3077115913 * M ** 3 + 0.2309699292 * S ** 3,
    -1.2684380046 * L ** 3 + 2.6097574011 * M ** 3 - 0.3413193965 * S ** 3,
    -0.0041960863 * L ** 3 - 0.7034186147 * M ** 3 + 1.707614701 * S ** 3,
  ];
}

const inGamut = (linear) => linear.every((c) => c >= -0.0001 && c <= 1.0001);

/** Returns gamma-encoded sRGB channels from 0 to 1, plus alpha. */
function parseColor(text) {
  const value = text.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g);
    return { rgb: digits.map((pair) => parseInt(pair, 16) / 255), alpha: 1 };
  }
  const oklch = value.match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/,
  );
  if (oklch) {
    const l = Number(oklch[1]) / (oklch[2] ? 100 : 1);
    const linear = oklchToLinear({ l, c: Number(oklch[3]), h: Number(oklch[4]) });
    const alpha = oklch[5] === undefined ? 1 : Number(oklch[5]) / (oklch[6] ? 100 : 1);
    return {
      rgb: linear.map((c) => linearToSrgb(Math.min(1, Math.max(0, c)))),
      alpha,
      outOfGamut: !inGamut(linear),
    };
  }
  throw new Error(`Can't read color: ${text}`);
}

const flatten = (fg, bg) => fg.rgb.map((c, i) => c * fg.alpha + bg.rgb[i] * (1 - fg.alpha));

function wcagRatio(fg, bg) {
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map(srgbToLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

/** APCA-W3 0.0.98G-4g. Positive is dark text on a light background. */
function apcaLc(fg, bg) {
  const y = ([r, g, b]) => 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
  const clampBlack = (v) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
  const text = clampBlack(y(fg));
  const back = clampBlack(y(bg));
  if (Math.abs(back - text) < 0.0005) return 0;
  if (back > text) {
    const s = (back ** 0.56 - text ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (back ** 0.65 - text ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

function contrast(foreground, background) {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (bg.alpha < 1) throw new Error("The background must be opaque. Flatten it first.");
  const flat = flatten(fg, bg);
  console.log(`WCAG 2  ${wcagRatio(flat, bg.rgb).toFixed(2)}:1`);
  console.log(`APCA    Lc ${apcaLc(flat, bg.rgb).toFixed(1)}`);
  if (fg.outOfGamut || bg.outOfGamut) console.log("Note    out of sRGB, measured after clipping");
}

function maxChroma(l, h) {
  let low = 0;
  let high = 0.4;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (inGamut(oklchToLinear({ l, c: mid, h }))) low = mid;
    else high = mid;
  }
  return low;
}

function ramp(hue, share, count) {
  const h = Number(hue);
  if (!Number.isFinite(h)) throw new Error(`Can't read hue: ${hue}`);
  // Finer steps at the light end, and both ends short of pure white and black.
  const LIGHT = 0.975;
  const DARK = 0.24;
  const white = parseColor("#ffffff").rgb;
  const black = parseColor("#000000").rgb;
  console.log("step  oklch                      on white  on black");
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const l = LIGHT - (LIGHT - DARK) * t ** 1.3;
    // Vividness peaks mid-ramp and falls off toward both ends.
    const taper = Math.min(1, 4 * t * (1 - t) + 0.12);
    const c = maxChroma(l, h) * share * taper;
    const value = `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`;
    const { rgb } = parseColor(value);
    console.log(
      `${String(i).padEnd(6)}${value.padEnd(27)}${wcagRatio(rgb, white).toFixed(2).padEnd(10)}${wcagRatio(rgb, black).toFixed(2)}`,
    );
  }
}

const [command, ...args] = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(args[index + 1]);
};

try {
  if (command === "contrast" && args.length === 2) contrast(args[0], args[1]);
  else if (command === "ramp" && args.length >= 1)
    ramp(args[0], flag("chroma", 0.8), flag("steps", 11));
  else {
    console.log(HELP);
    process.exitCode = command === "--help" ? 0 : 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
