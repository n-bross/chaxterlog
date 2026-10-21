import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEventDays } from "./event-analytics.ts";
import type { ChaxterEvent } from "./events.ts";

const event = (id: string, date: string, title: string): ChaxterEvent => ({ id, date, title, createdAt: "2026-10-01T00:00:00Z" });

test("an event day is compared with normal days of the same weekday", () => {
  // Fridays: 02.10. and 16.10. are normal (20 and 30 visits), 09.10. has an event (50 visits).
  const days = [
    { date: "2026-10-02", u15: 10, o15: 10 },
    { date: "2026-10-09", u15: 20, o15: 30 },
    { date: "2026-10-16", u15: 20, o15: 10 },
    { date: "2026-10-08", u15: 90, o15: 90 }, // a Thursday never serves as comparison for a Friday
  ];
  const { eventDays, best, averageUplift } = analyzeEventDays([event("e1", "2026-10-09", "Kickerturnier")], days);
  const [day] = eventDays;
  assert.deepEqual(day.baseline, { u15: 15, o15: 10, total: 25, days: 2 });
  assert.equal(day.uplift, 1); // 50 instead of 25: +100 %
  assert.equal(day.upliftO15, 2); // 30 instead of 10
  assert.equal(best?.date, "2026-10-09");
  assert.equal(averageUplift, 1);
});

test("several events on one day share it, other event days and closed days are no baseline", () => {
  const days = [
    { date: "2026-10-02", u15: 5, o15: 5 }, // event day: not a normal day
    { date: "2026-10-09", u15: 10, o15: 10 },
    { date: "2026-10-23", u15: 0, o15: 0 }, // closed: ignored
  ];
  const events = [event("a", "2026-10-09", "Kicker"), event("b", "2026-10-09", "Waffeln"), event("c", "2026-10-02", "Kino")];
  const { eventDays, compared } = analyzeEventDays(events, days);
  assert.equal(eventDays.length, 2);
  assert.deepEqual(eventDays[0].events.map((item) => item.title), ["Kicker", "Waffeln"]);
  assert.equal(eventDays[0].baseline, null);
  assert.equal(eventDays[0].uplift, null);
  assert.equal(compared, 0);
});

test("normal days further than eight weeks away are not compared", () => {
  const days = [{ date: "2026-01-02", u15: 10, o15: 0 }, { date: "2026-10-09", u15: 20, o15: 0 }];
  assert.equal(analyzeEventDays([event("e", "2026-10-09", "Fest")], days).eventDays[0].baseline, null);
});
