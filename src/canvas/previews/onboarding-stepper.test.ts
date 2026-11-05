import { describe, expect, it } from "vite-plus/test";

import {
  groupedOrder,
  parseDomain,
  promptsFor,
  reconcilePrompts,
  togglePick,
  visibleCompetitors,
} from "./onboarding-stepper";

describe("parseDomain", () => {
  it.each([
    ["acme.com", "acme.com"],
    ["www.acme.com", "acme.com"],
    ["https://acme.com/pricing", "acme.com"],
    ["  HTTP://WWW.Acme.COM:8080/a?b=c  ", "acme.com"],
    ["docs.acme.co.uk", "docs.acme.co.uk"],
  ])("reduces %s to its domain", (input, domain) => {
    expect(parseDomain(input)).toBe(domain);
  });

  it.each(["", "acme", "acme.", ".com", "a b.com", "me@acme.com", "ftp://acme.com", "acme.c"])(
    "rejects %j",
    (input) => {
      expect(parseDomain(input)).toBeNull();
    },
  );
});

describe("visibleCompetitors", () => {
  const list = [
    { name: "Linear", domain: "linear.app" },
    { name: "Jira", domain: "atlassian.com" },
  ];

  it("hides the site's own row, including from a subdomain", () => {
    expect(visibleCompetitors(list, "linear.app").map((c) => c.name)).toEqual(["Jira"]);
    expect(visibleCompetitors(list, "jira.atlassian.com").map((c) => c.name)).toEqual(["Linear"]);
  });

  it("keeps a domain that only ends with the same letters", () => {
    expect(visibleCompetitors(list, "notlinear.app")).toHaveLength(2);
  });
});

describe("reconcilePrompts", () => {
  const selected = ["best-tool", "compare", "alternatives"];

  it("keeps every pick while the lead competitor is unchanged or first set", () => {
    expect(reconcilePrompts(selected, "linear.app", "linear.app")).toEqual(selected);
    expect(reconcilePrompts(selected, null, "linear.app")).toEqual(selected);
  });

  it("deselects only the prompts that named the old lead", () => {
    expect(reconcilePrompts(selected, "linear.app", "asana.com")).toEqual(["best-tool"]);
  });

  it("marks exactly the prompts whose text carries the rival", () => {
    for (const prompt of promptsFor("acme.com", "Linear")) {
      expect(prompt.text.includes("Linear")).toBe(prompt.namesRival);
    }
  });
});

describe("togglePick", () => {
  it("adds, removes, and refuses a pick past the limit without changing the list", () => {
    expect(togglePick(["a"], "b", 2)).toEqual({ picks: ["a", "b"], outcome: "added" });
    expect(togglePick(["a", "b"], "a", 2)).toEqual({ picks: ["b"], outcome: "removed" });
    expect(togglePick(["a", "b"], "c", 2)).toEqual({ picks: ["a", "b"], outcome: "refused" });
  });
});

describe("groupedOrder", () => {
  const ids = ["a", "b", "c", "d", "e"];

  it("moves nothing for no pick, one pick, or adjacent picks", () => {
    expect(groupedOrder(ids, [])).toEqual(ids);
    expect(groupedOrder(ids, ["c"])).toEqual(ids);
    expect(groupedOrder(ids, ["c", "b"])).toEqual(ids);
    expect(groupedOrder(ids, ["b", "c"])).toEqual(ids);
  });

  it("brings a later pick to the first pick, from either side", () => {
    expect(groupedOrder(ids, ["a", "d"])).toEqual(["a", "d", "b", "c", "e"]);
    expect(groupedOrder(ids, ["d", "a"])).toEqual(["b", "c", "a", "d", "e"]);
  });

  it("returns a deselected row to its own place", () => {
    expect(groupedOrder(ids, ["d"])).toEqual(ids);
    expect(groupedOrder(ids, ["a", "c", "e"])).toEqual(["a", "c", "e", "b", "d"]);
    expect(groupedOrder(ids, ["a", "e"])).toEqual(["a", "e", "b", "c", "d"]);
  });

  it("ignores a pick that's no longer in the list", () => {
    expect(groupedOrder(ids, ["gone", "d"])).toEqual(ids);
  });
});
