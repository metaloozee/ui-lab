#!/usr/bin/env node
// Samples an element's box and opacity on every frame while real input plays against a running page.
// It reports measurements only. Whether the motion feels right is the reader's call.

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const HELP = `Usage: node sample-frames.mjs --target <css> --action <action> [options]

  --target <css>      Element to measure on every frame (required)
  --action <action>   Input played while sampling. Repeat it, and add @ms to delay one:
                        click:<css>  hover:<css>  press:<css>  release  key:<name>  move:<x>,<y>
  --before <action>   Input played before sampling starts. Repeatable
  --url <url>         Page to load (default http://localhost:5173)
  --ms <ms>           How long to sample (default 500)
  --theme <theme>     light, dark, or both (default both)
  --reduced           Emulate prefers-reduced-motion
  --viewport <w>x<h>  Viewport size (default 1200x800)
  --shots <ms,ms>     Screenshot at these times
  --out <dir>         Directory for screenshots (default current directory)
  --frames            Print every frame

Input takes about 100ms to reach the page, so an @ms delay is approximate. Use --frames to see
when an interruption really landed.

Example: --target '[data-canvas-overlay] > div' \\
  --action 'click:button[aria-label="Inspect"]' \\
  --action 'click:button[aria-label="Inspect"]@80'`;

function parseArgs(argv) {
  const options = { url: "http://localhost:5173", ms: 500, theme: "both", viewport: "1200x800" };
  options.action = [];
  options.before = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index].replace(/^--/, "");
    if (flag === "help") options.help = true;
    else if (flag === "reduced" || flag === "frames") options[flag] = true;
    else if (flag === "action" || flag === "before") options[flag].push(argv[(index += 1)]);
    else options[flag] = argv[(index += 1)];
  }
  return options;
}

function loadPlaywright() {
  const roots = [join(process.cwd(), "noop.js")];
  const npxCache = join(homedir(), ".npm/_npx");
  if (existsSync(npxCache)) {
    for (const entry of readdirSync(npxCache)) roots.push(join(npxCache, entry, "noop.js"));
  }
  for (const root of roots) {
    for (const name of ["playwright-core", "playwright"]) {
      try {
        return createRequire(root)(name);
      } catch {
        // Try the next location.
      }
    }
  }
  throw new Error("Playwright not found. Run `vp dlx playwright install chromium`, then retry.");
}

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache/ms-playwright");
  if (!existsSync(cache)) return undefined;
  const shells = readdirSync(cache)
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const shell of shells) {
    const path = join(cache, shell, "chrome-headless-shell-linux64/chrome-headless-shell");
    if (existsSync(path)) return path;
  }
  return undefined;
}

function parseAction(text) {
  const timed = text.match(/^(.*)@(\d+)$/);
  const body = timed ? timed[1] : text;
  const colon = body.indexOf(":");
  return {
    kind: colon === -1 ? body : body.slice(0, colon),
    value: colon === -1 ? "" : body.slice(colon + 1),
    at: timed ? Number(timed[2]) : 0,
  };
}

// Goes through the mouse directly, because locator actions wait for an element to stop moving.
async function play(page, { kind, value }) {
  if (kind === "key") return page.keyboard.press(value);
  if (kind === "release") return page.mouse.up();
  if (kind === "move") {
    const [x, y] = value.split(",").map(Number);
    return page.mouse.move(x, y);
  }
  const box = await page.locator(value).first().boundingBox();
  if (!box) throw new Error(`Nothing to ${kind} at ${value}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (kind === "hover") return undefined;
  await page.mouse.down();
  if (kind === "click") await page.mouse.up();
  return undefined;
}

const record = ([selector, ms]) =>
  new Promise((done, fail) => {
    const element = document.querySelector(selector);
    if (!element) return fail(new Error(`No element matches ${selector}`));
    const frames = [];
    const start = performance.now();
    const frame = () => {
      const box = element.getBoundingClientRect();
      frames.push({
        t: Math.round(performance.now() - start),
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height,
        opacity: Number(getComputedStyle(element).opacity),
      });
      if (performance.now() - start < ms) requestAnimationFrame(frame);
      else done(frames);
    };
    frame();
    return undefined;
  });

const round = (value) => Math.round(value * 10) / 10;
const AXES = ["x", "y", "w", "h"];

function summarize(frames) {
  const first = frames[0];
  const last = frames.at(-1);
  const box = (f) => `x ${round(f.x)}  y ${round(f.y)}  w ${round(f.w)}  h ${round(f.h)}`;
  const lines = [
    `Frames        ${frames.length} over ${last.t}ms`,
    `Start box     ${box(first)}`,
    `End box       ${box(last)}`,
  ];

  let settled = 0;
  for (const [index, frame] of frames.entries()) {
    if (AXES.some((axis) => Math.abs(frame[axis] - last[axis]) > 0.5)) {
      settled = frames[index + 1]?.t ?? frame.t;
    }
  }
  lines.push(`Settled at    ${settled}ms${settled >= last.t ? " (still moving, raise --ms)" : ""}`);

  for (const axis of AXES) {
    const travel = last[axis] - first[axis];
    const values = frames.map((frame) => frame[axis]);
    const range = Math.max(...values) - Math.min(...values);
    if (range < 0.5) continue;

    let largest = { size: 0, t: 0, gap: 0 };
    let turns = 0;
    let direction = 0;
    for (let index = 1; index < frames.length; index += 1) {
      const delta = values[index] - values[index - 1];
      if (Math.abs(delta) > Math.abs(largest.size)) {
        largest = { size: delta, t: frames[index].t, gap: frames[index].t - frames[index - 1].t };
      }
      if (Math.abs(delta) > 0.5) {
        if (direction && Math.sign(delta) !== direction) turns += 1;
        direction = Math.sign(delta);
      }
    }
    const beyond =
      travel >= 0 ? Math.max(...values) - last[axis] : last[axis] - Math.min(...values);
    const share = round((Math.abs(largest.size) / range) * 100);
    lines.push(
      `${axis.padEnd(14)}travel ${round(travel)}  largest step ${round(largest.size)} at ${largest.t}ms in a ${largest.gap}ms frame (${share}% of range)  past the end ${round(beyond)}  direction changes ${turns}`,
    );
  }

  const longest = frames.slice(1).reduce(
    (worst, frame, index) => {
      const gap = frame.t - frames[index].t;
      return gap > worst.gap ? { gap, t: frame.t } : worst;
    },
    { gap: 0, t: 0 },
  );
  lines.push(`Longest frame ${longest.gap}ms, ending at ${longest.t}ms`);

  const opacities = frames.map((frame) => frame.opacity);
  const low = Math.min(...opacities);
  const high = Math.max(...opacities);
  if (high - low > 0.001) lines.push(`Opacity       ${round(low)} to ${round(high)}`);
  return lines.join("\n");
}

async function runTheme(browser, options, theme) {
  const [width, height] = options.viewport.split("x").map(Number);
  const page = await browser.newPage({
    viewport: { width, height },
    colorScheme: theme,
    reducedMotion: options.reduced ? "reduce" : "no-preference",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(options.url);
  await page.waitForLoadState("networkidle");
  for (const text of options.before) {
    await play(page, parseAction(text));
    await page.waitForTimeout(100);
  }

  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const recording = page.evaluate(record, [options.target, Number(options.ms)]);
  const inputs = options.action.map(parseAction).map(async (action) => {
    await wait(action.at);
    await play(page, action);
  });
  const shots = String(options.shots ?? "")
    .split(",")
    .filter(Boolean)
    .map(async (at) => {
      await wait(Number(at));
      const out = resolve(options.out ?? ".");
      mkdirSync(out, { recursive: true });
      await page.screenshot({ path: join(out, `frame-${theme}-${at}ms.png`) });
    });

  const [frames] = await Promise.all([recording, ...inputs, ...shots]);
  const label = options.reduced ? `${theme}, reduced motion` : theme;
  console.log(`\n=== ${label}\n${summarize(frames)}`);
  if (options.frames) {
    for (const frame of frames) {
      console.log(
        `${String(frame.t).padStart(5)}ms  x ${round(frame.x)}  y ${round(frame.y)}  w ${round(frame.w)}  h ${round(frame.h)}  opacity ${round(frame.opacity)}`,
      );
    }
  }
  console.log(`Console errors ${errors.length ? errors.join("\n  ") : "none"}`);
  await page.close();
}

const options = parseArgs(process.argv.slice(2));
if (options.help || !options.target || !options.action.length) {
  console.log(HELP);
  process.exit(options.help ? 0 : 1);
}

let browser;
try {
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ executablePath: findBrowser() });
  const themes = options.theme === "both" ? ["light", "dark"] : [options.theme];
  for (const theme of themes) await runTheme(browser, options, theme);
} catch (error) {
  console.error(error.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
