import test from "node:test";
import assert from "node:assert/strict";
import { berlinHour, updateAggregate } from "./aggregation.ts";
import { analyzeAggregates, analyzeEvents } from "./statistics.ts";
test("aggregates use Berlin midnight and merge both DST instances of the same hour", () => {
  let counts = updateAggregate(null, "2026-10-24T22:30:00Z", "u15", 1);
  assert.equal(counts.date, "2026-10-25"); assert.equal(counts.u[0], 1);
  counts = updateAggregate(counts, "2026-10-25T00:30:00Z", "u15", 1);
  counts = updateAggregate(counts, "2026-10-25T01:30:00Z", "u15", 1);
  assert.equal(counts.u[2], 2); assert.equal(counts.u15, 3);
  const cancelled = updateAggregate(counts, "2026-10-25T00:30:00Z", "u15", -1);
  assert.equal(cancelled.u[2], 1); assert.equal(counts.u[2], 2);
  assert.equal(berlinHour("2026-03-29T01:30:00Z"), 3);
});
test("aggregate statistics equal visit statistics without expanding visits", () => {
  const visits = Array.from({ length: 130 }, (_, i) => ({ id: String(i), timestamp: `2026-10-${i % 2 ? "19" : "20"}T12:00:00Z`, group: i % 3 ? "u15" as const : "o15" as const }));
  const days = new Map<string, ReturnType<typeof updateAggregate>>();
  for (const visit of visits) { const key = visit.timestamp.slice(0, 10); days.set(key, updateAggregate(days.get(key) ?? null, visit.timestamp, visit.group, 1)); }
  const actual = analyzeAggregates([...days.values()], "month", "2026-10-19"), expected = analyzeEvents(visits, "month", "2026-10-19");
  for (const key of ["total", "counts", "average", "recordedDays", "weekdays", "hours", "series", "bestDays", "bestWeekdays"] as const) assert.deepEqual(actual[key], expected[key]);
  assert.equal(actual.events.length, 0);
});
