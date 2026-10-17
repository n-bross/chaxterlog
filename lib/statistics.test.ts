import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEvents, periodRange, shiftPeriod } from "./statistics.ts";
import type { TrackEvent } from "./tracking.ts";
const event = (timestamp: string, group: "u15" | "o15" = "u15"): TrackEvent => ({ id: "e3d907b1-05aa-4eac-89a0-34c7e514bc01", timestamp, group });

test("calendar periods include Monday–Sunday, leap February, and year boundaries", () => {
  assert.deepEqual(periodRange("week", "2027-01-01"), { start: "2026-12-28", end: "2027-01-03" });
  assert.deepEqual(periodRange("month", "2024-02-20"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(periodRange("year", "2026-10-17"), { start: "2026-01-01", end: "2026-12-31" });
  assert.equal(periodRange("all", "2026-10-17"), null);
  assert.equal(shiftPeriod("month", "2026-01-31", 1), "2026-02-01");
  assert.equal(shiftPeriod("year", "2024-02-29", 1), "2025-01-01");
  assert.equal(shiftPeriod("week", "2026-12-28", 1), "2027-01-04");
});

test("range filtering uses Berlin local dates and hours, including both DST hours", () => {
  const result = analyzeEvents([
    event("2026-10-24T21:59:59Z"), // Saturday
    event("2026-10-24T22:00:00Z", "o15"), // Sunday midnight
    event("2026-10-25T00:30:00Z"), // 02:30 CEST
    event("2026-10-25T01:30:00Z"), // 02:30 CET
    event("2026-10-25T23:00:00Z"), // Monday
  ], "day", "2026-10-25");
  assert.equal(result.total, 3);
  assert.deepEqual(result.counts, { u15: 2, o15: 1 });
  assert.equal(result.hours[2].total, 2);
  assert.equal(result.hours[0].total, 1);
  assert.equal(result.weekdays[6].total, 3);
});

test("best weekday uses average per recorded weekday, not the largest sum", () => {
  const events = [
    ...Array.from({ length: 6 }, () => event("2026-10-05T12:00:00Z")),
    ...Array.from({ length: 6 }, () => event("2026-10-12T12:00:00Z")),
    ...Array.from({ length: 9 }, () => event("2026-10-06T13:00:00Z", "o15")),
  ];
  const result = analyzeEvents(events, "month", "2026-10-17");
  assert.equal(result.bestWeekdays[0].label, "Dienstag");
  assert.equal(result.weekdays[0].average, 6);
  assert.equal(result.weekdays[1].average, 9);
  assert.equal(result.recordedDays, 3);
  assert.equal(result.average, 7);
  assert.equal(result.bestHours[0].key, "14");
  assert.equal(result.bestDays[0].key, "2026-10-06");
});

test("ties remain ties and empty ranges never invent winners", () => {
  const result = analyzeEvents([event("2026-10-05T12:00:00Z"), event("2026-10-06T13:00:00Z")], "all", "2026-10-17");
  assert.equal(result.bestWeekdays.length, 2);
  assert.equal(result.bestHours.length, 2);
  assert.equal(result.bestDays.length, 2);
  const empty = analyzeEvents([], "year", "2026-10-17");
  assert.equal(empty.total, 0);
  assert.equal(empty.average, 0);
  assert.deepEqual(empty.bestWeekdays, []);
  assert.deepEqual(empty.bestHours, []);
  assert.deepEqual(empty.bestDays, []);
  assert.equal(empty.series.length, 12);
});

test("trend totals match period totals and missing calendar buckets stay zero", () => {
  const events = [event("2026-09-30T22:30:00Z"), event("2026-10-17T12:00:00Z", "o15"), event("2025-01-01T10:00:00Z")];
  for (const period of ["day", "week", "month", "year", "all"] as const) {
    const result = analyzeEvents(events, period, "2026-10-17");
    assert.equal(result.series.reduce((sum, item) => sum + item.total, 0), result.total);
    assert.equal(result.series.reduce((sum, item) => sum + item.u15, 0), result.counts.u15);
  }
  const month = analyzeEvents(events, "month", "2026-10-17");
  assert.equal(month.series.length, 31);
  assert.equal(month.series[1].total, 0);
  assert.equal(month.series[0].total, 1);
});
