import { expect, it } from "vite-plus/test";

import { canvasEntries } from "./registry";

it("gives every entry a unique id and name, since both are how items get referenced", () => {
  const ids = canvasEntries.map((entry) => entry.id);
  const names = canvasEntries.map((entry) => entry.name);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(names).size).toBe(names.length);
});
