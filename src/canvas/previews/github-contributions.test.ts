import { expect, it } from "vite-plus/test";

import { buildCalendar, type Contribution } from "./github-contributions";

const day = (date: string, count = 1): Contribution => ({ date, count, level: count > 0 ? 1 : 0 });

function everyDay(from: string, to: string): Contribution[] {
  const days: Contribution[] = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86_400_000) {
    days.push(day(new Date(time).toISOString().slice(0, 10)));
  }
  return days;
}

it("places a range that starts mid-week on its real weekday", () => {
  const { days, weeks } = buildCalendar(everyDay("2026-03-04", "2026-03-09"));
  expect(days[0]).toMatchObject({ week: 0, weekday: 3 });
  expect(days[4]).toMatchObject({ date: "2026-03-08", week: 1, weekday: 0 });
  expect(weeks).toBe(2);
});

it("fills days the data skipped as empty, and leaves them out of the total", () => {
  const { days, total } = buildCalendar([day("2026-03-01", 2), day("2026-03-04", 3)]);
  expect(days.map((entry) => entry.count)).toEqual([2, 0, 0, 3]);
  expect(total).toBe(5);
  expect(days[1].label).toBe("No contributions on Mon, 2 Mar 2026");
});

it("uses the singular for one contribution", () => {
  const { days } = buildCalendar([day("2026-03-01", 1)]);
  expect(days[0].label).toBe("1 contribution on Sun, 1 Mar 2026");
});

it("names a month over the first column it opens, and drops slivers at either end", () => {
  const { months } = buildCalendar(everyDay("2025-11-02", "2026-11-04"));
  expect(months[0]).toEqual({ label: "Nov", week: 0 });
  expect(months[1]).toEqual({ label: "Dec", week: 5 });
  expect(months[months.length - 1].label).toBe("Oct");

  const sliverFirst = buildCalendar(everyDay("2026-01-25", "2026-04-15")).months;
  expect(sliverFirst[0].label).toBe("Feb");
});

it("counts the same day in any viewer's timezone", () => {
  const { range } = buildCalendar([day("2026-01-01"), day("2026-12-31")]);
  expect(range).toBe("1 Jan 2026 – 31 Dec 2026");
});
