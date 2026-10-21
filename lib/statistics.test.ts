import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAggregates, analyzeEvents, periodRange, previousRange, shiftPeriod } from "./statistics.ts";
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

test("custom period filters accurately and builds daily or monthly series", () => {
  const events = [
    event("2026-10-05T12:00:00Z"),
    event("2026-10-10T12:00:00Z", "o15"),
    event("2026-10-20T12:00:00Z"),
  ];
  const custom = analyzeEvents(events, "custom", "2026-10-01", "2026-10-15");
  assert.equal(custom.total, 2);
  assert.equal(custom.counts.u15, 1);
  assert.equal(custom.counts.o15, 1);
  assert.equal(custom.unit, "day");
  assert.equal(custom.series.length, 15);
  assert.equal(custom.range?.start, "2026-10-01");
  assert.equal(custom.range?.end, "2026-10-15");
});

test("each period is compared with the one before it", () => {
  assert.deepEqual(previousRange("day", "2026-10-21"), { start: "2026-10-20", end: "2026-10-20", label: "Vortag" });
  assert.deepEqual(previousRange("week", "2026-10-21"), { start: "2026-10-12", end: "2026-10-18", label: "Vorwoche" });
  assert.deepEqual(previousRange("month", "2026-03-31"), { start: "2026-02-01", end: "2026-02-28", label: "Vormonat" });
  assert.deepEqual(previousRange("year", "2026-10-21"), { start: "2025-01-01", end: "2025-12-31", label: "Vorjahr" });
  assert.deepEqual(previousRange("custom", "2026-10-11", "2026-10-20"), { start: "2026-10-01", end: "2026-10-10", label: "vorherigem Zeitraum" });
  assert.equal(previousRange("all", "2026-10-21"), null);
});

test("a running period is compared with the same number of days before it", () => {
  // Wednesday 21.10.: Monday–Wednesday against Monday–Wednesday of the week before.
  assert.deepEqual(previousRange("week", "2026-10-21", undefined, "2026-10-21"), { start: "2026-10-12", end: "2026-10-14", label: "12.10.–14.10." });
  assert.deepEqual(previousRange("month", "2026-10-21", undefined, "2026-10-21"), { start: "2026-09-01", end: "2026-09-21", label: "01.09.–21.09." });
  // A finished period and a single day keep their full comparison.
  assert.equal(previousRange("month", "2026-09-10", undefined, "2026-10-21")!.label, "Vormonat");
  assert.equal(previousRange("day", "2026-10-21", undefined, "2026-10-21")!.label, "Vortag");
});

test("backfilled visits in hour 0 count in totals but are reported as undated", () => {
  const hours = (values: Record<number, number>) => Array.from({ length: 24 }, (_, hour) => values[hour] ?? 0);
  const stats = analyzeAggregates([{ date: "2026-10-20", u15: 5, o15: 2, u: hours({ 0: 2, 16: 3 }), o: hours({ 18: 2 }) }], "day", "2026-10-20");
  assert.equal(stats.total, 7);
  assert.equal(stats.undated.total, 2);
  assert.equal(stats.undated.u15, 2);
});
