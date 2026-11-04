import type { CanvasEntry } from "./registry";

/** The parts of DESIGN.md that describe the system rather than the lab's own canvas. */
export const PROMPT_SECTIONS = [
  "Colors",
  "Themes",
  "Typography",
  "Shapes",
  "Sizes",
  "Elevation & Depth",
  "Motion",
  "Interaction",
];

/** Always travels with a component: its tokens, and what every component expects around it. */
const SYSTEM_ROOTS = ["/src/index.css", "/src/lib/fluid-provider.tsx", "/src/lib/icons.ts"];

type ReadFile = (path: string) => Promise<string>;

const IMPORT = /(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveLocal(specifier: string, from: string, exists: (path: string) => boolean) {
  const clean = specifier.split("?")[0] ?? specifier;
  const base = clean.startsWith("@/")
    ? `/src/${clean.slice(2)}`
    : new URL(clean, `file://${from}`).pathname;
  return EXTENSIONS.map((extension) => base + extension).find(exists);
}

const packageOf = (specifier: string) => {
  const parts = specifier.split("/");
  return (specifier.startsWith("@") ? parts.slice(0, 2) : parts.slice(0, 1)).join("/");
};

/** Follows imports from the component outward. Files come back in the order they were reached. */
export async function collectSources(
  roots: readonly string[],
  paths: readonly string[],
  read: ReadFile,
) {
  const known = new Set(paths);
  const files = new Map<string, string>();
  const packages = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const path = queue.shift();
    if (!path || files.has(path)) continue;
    const source = await read(path);
    files.set(path, source);
    for (const [, specifier] of source.matchAll(IMPORT)) {
      if (!specifier) continue;
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const local = resolveLocal(specifier, path, (candidate) => known.has(candidate));
        if (local) queue.push(local);
      } else {
        packages.add(packageOf(specifier));
      }
    }
  }
  return { files, packages };
}

export function designSections(design: string, names: readonly string[]) {
  const sections = design.split(/^## /m).slice(1);
  return names.flatMap((name) => {
    const section = sections.find((candidate) => candidate.startsWith(`${name}\n`));
    return section ? [`### ${section.trim()}`] : [];
  });
}

/** Longer than any run of backticks inside, so source can't close its own block. */
function fenced(path: string, source: string) {
  const longest = Math.max(2, ...[...source.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = "`".repeat(longest + 1);
  const language = path.split(".").pop() ?? "";
  return `### ${path.replace(/^\//, "")}\n\n${fence}${language}\n${source.trimEnd()}\n${fence}`;
}

export function buildPrompt({
  entry,
  files,
  packages,
  design,
  versions,
}: {
  entry: Pick<CanvasEntry, "name" | "purpose" | "previewProps">;
  files: ReadonlyMap<string, string>;
  packages: ReadonlySet<string>;
  design: string;
  versions: Readonly<Record<string, string>>;
}) {
  const props = entry.previewProps ? JSON.stringify(entry.previewProps, null, 2) : "{}";
  const installed = [...packages].flatMap((name) => {
    const version = versions[name];
    return version ? [`- ${name} ${version}`] : [];
  });

  return [
    `# Build "${entry.name}" in this workspace`,
    "This component was crafted in ui-lab, a scratchpad for pushing interface details. Everything needed to rebuild it is below: what it's for, the design and motion system it was built on, and its complete source.",
    `## What it is\n\n${entry.purpose}`,
    props === "{}" ? "" : `It was previewed with these props:\n\n\`\`\`json\n${props}\n\`\`\``,
    [
      "## How to rebuild it",
      "1. Read the component's source first, then this workspace's own components, tokens, and motion code.",
      "2. Rewrite it against what this workspace already has. The source below is a complete reference, not something to paste: reuse the equivalent where one exists, and bring over a supporting file only when nothing here does its job.",
      "3. Keep its behavior and feel exact: states, keyboard handling, spring values, hover, press, and how each state change animates. Map colors, radii, and sizes to this workspace's tokens by role.",
      "4. Run it. Hover, press, and use the keyboard in light and dark, with reduced motion on and off. Report anything you couldn't judge.",
    ].join("\n\n"),
    ["## Design and motion system", ...designSections(design, PROMPT_SECTIONS)].join("\n\n"),
    installed.length > 0 ? `## Packages it uses\n\n${installed.join("\n")}` : "",
    [
      "## Source",
      "The component comes first, followed by everything it imports and the system's tokens.",
      ...[...files].map(([path, source]) => fenced(path, source)),
    ].join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

const loaders = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx,css}", "!/src/**/*.test.*", "/DESIGN.md", "/package.json"],
  { query: "?raw", import: "default" },
);

const readFile: ReadFile = (path) => {
  const load = loaders[path];
  if (!load) throw new Error(`No source at ${path}`);
  return load();
};

export const hasSource = (path: string) => path in loaders;

async function promptFor(entry: CanvasEntry) {
  const { files, packages } = await collectSources(
    [entry.source, ...SYSTEM_ROOTS],
    Object.keys(loaders),
    readFile,
  );
  const [design, manifest] = await Promise.all([readFile("/DESIGN.md"), readFile("/package.json")]);
  const { dependencies, devDependencies } = JSON.parse(manifest) as Record<
    "dependencies" | "devDependencies",
    Record<string, string>
  >;
  const versions = { ...devDependencies, ...dependencies };
  return buildPrompt({ entry, files, packages, design, versions });
}

export async function copyItemPrompt(entry: CanvasEntry) {
  const prompt = promptFor(entry);
  // Safari only allows a write that starts inside the click, so it gets the text as a promise.
  if (typeof ClipboardItem === "function") {
    const blob = prompt.then((text) => new Blob([text], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
  } else {
    await navigator.clipboard.writeText(await prompt);
  }
}
