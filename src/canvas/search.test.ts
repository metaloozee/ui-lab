import { expect, it } from "vite-plus/test";

import type { CanvasEntry } from "./registry";
import { filterEntries } from "./search";

const entry = (id: string, name: string, purpose: string): CanvasEntry => ({
  id,
  name,
  purpose,
  source: `/src/canvas/previews/${id}.tsx`,
  width: 100,
  height: 100,
  x: 0,
  y: 0,
  render: () => null,
});

const entries = [
  entry("otp", "Input OTP", "One-time code with a travelling caret"),
  entry("stepper", "Checkout stepper", "Walks through payment one step at a time"),
  entry("mesh", "Gradient mesh", "Drag points to bend the colors"),
];

const ids = (query: string) => filterEntries(entries, query).map((item) => item.id);

it("matches every word in any order, across name and purpose", () => {
  expect(ids("code otp")).toEqual(["otp"]);
  expect(ids("STEP payment")).toEqual(["stepper"]);
  expect(ids("otp mesh")).toEqual([]);
});

it("keeps registry order, so rows don't move as the query grows", () => {
  expect(ids("")).toEqual(["otp", "stepper", "mesh"]);
  expect(ids("o")).toEqual(["otp", "stepper", "mesh"]);
});
