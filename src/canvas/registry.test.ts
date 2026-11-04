import { expect, it } from "vite-plus/test";

import { hasSource } from "./prompt";
import { canvasEntries } from "./registry";

it("gives every entry a unique id and name, since both are how items get referenced", () => {
  const ids = canvasEntries.map((entry) => entry.id);
  const names = canvasEntries.map((entry) => entry.name);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(names).size).toBe(names.length);
});

it("points every entry at real source and says what it's for, since the copied prompt needs both", () => {
  for (const entry of canvasEntries) {
    expect(hasSource(entry.source), entry.source).toBe(true);
    expect(entry.purpose.trim(), entry.id).not.toBe("");
  }
});
