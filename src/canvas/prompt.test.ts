import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it } from "vite-plus/test";

import { buildPrompt, collectSources, designSections, PROMPT_SECTIONS } from "./prompt";

const tree: Record<string, string> = {
  "/src/canvas/previews/otp.tsx": `import { motion } from "motion/react";
import { spring } from "@/lib/springs";
import { Slot } from "./slot";
import type { Base } from "@base-ui/react/field";`,
  "/src/canvas/previews/slot.tsx": `import { spring } from "@/lib/springs";
import { Otp } from "./otp";`,
  "/src/lib/springs.ts": "export const spring = {};",
  "/src/lib/unrelated.ts": "export const nope = 1;",
};
const read = async (path: string) => tree[path] ?? "";

it("follows aliased and relative imports once each, and leaves out what isn't imported", async () => {
  const { files, packages } = await collectSources(
    ["/src/canvas/previews/otp.tsx"],
    Object.keys(tree),
    read,
  );
  expect([...files.keys()]).toEqual([
    "/src/canvas/previews/otp.tsx",
    "/src/lib/springs.ts",
    "/src/canvas/previews/slot.tsx",
  ]);
  expect([...packages]).toEqual(["motion", "@base-ui/react"]);
});

it("fences source so backticks inside it can't close the block", () => {
  const prompt = buildPrompt({
    entry: { name: "Input OTP", purpose: "Enter a code", previewProps: { length: 6 } },
    files: new Map([["/src/a.ts", "const doc = `\n```\n`;"]]),
    packages: new Set(["motion", "not-in-manifest"]),
    design: "## Motion\n\nSprings.\n\n## Layout\n\nCanvas only.\n",
    versions: { motion: "^14.9.0" },
  });
  expect(prompt).toContain("````ts\nconst doc");
  expect(prompt).toContain("Enter a code");
  expect(prompt).toContain('"length": 6');
  expect(prompt).toContain("### Motion\n\nSprings.");
  expect(prompt).not.toContain("Canvas only.");
  expect(prompt).toContain("- motion ^14.9.0");
  expect(prompt).not.toContain("not-in-manifest");
});

it("finds every section the prompt relies on in the real DESIGN.md", () => {
  const design = readFileSync(resolve(import.meta.dirname, "../../DESIGN.md"), "utf8");
  expect(designSections(design, PROMPT_SECTIONS)).toHaveLength(PROMPT_SECTIONS.length);
});
