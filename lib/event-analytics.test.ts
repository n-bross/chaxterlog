import assert from "node:assert/strict";
import test from "node:test";
import { categorizeEvent, analyzeEventsAttendance } from "./event-analytics.ts";
import type { ChaxterEvent } from "./events.ts";
import type { TrackEvent } from "./tracking.ts";

test("categorizeEvent matches known sports, tournaments, and keywords", () => {
  assert.equal(categorizeEvent("Kicker-Turnier Mai 2026").label, "Kicker-Turniere");
  assert.equal(categorizeEvent("Großes Billard-Turnier").label, "Billard-Turniere");
  assert.equal(categorizeEvent("Sommerfest 2026").label, "Feste & Partys");
  assert.equal(categorizeEvent("Kinoabend mit Popcorn").label, "Kino & Filmabende");
  assert.equal(categorizeEvent("Pizza backen").label, "Kochen & Grillen");
  assert.equal(categorizeEvent("FIFA PlayStation Cup").label, "Gaming & Konsole");
});

test("analyzeEventsAttendance calculates all-time best event and groups correctly", () => {
  const events: ChaxterEvent[] = [
    { id: "e1", date: "2026-10-10", title: "Kicker-Turnier #1", createdAt: "2026-10-01T00:00:00Z" },
    { id: "e2", date: "2026-10-15", title: "Kicker-Turnier #2", createdAt: "2026-10-01T00:00:00Z" },
    { id: "e3", date: "2026-10-20", title: "Großes Sommerfest", createdAt: "2026-10-01T00:00:00Z" },
  ];

  const visits: TrackEvent[] = [
    // 2026-10-10: 2 visits
    { id: "v1", group: "u15", timestamp: "2026-10-10T14:00:00Z" },
    { id: "v2", group: "o15", timestamp: "2026-10-10T15:00:00Z" },
    // 2026-10-15: 4 visits
    { id: "v3", group: "u15", timestamp: "2026-10-15T14:00:00Z" },
    { id: "v4", group: "u15", timestamp: "2026-10-15T14:30:00Z" },
    { id: "v5", group: "o15", timestamp: "2026-10-15T15:00:00Z" },
    { id: "v6", group: "o15", timestamp: "2026-10-15T16:00:00Z" },
    // 2026-10-20: 10 visits
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `v-fest-${i}`,
      group: "u15" as const,
      timestamp: "2026-10-20T16:00:00Z",
    })),
  ];

  const analysis = analyzeEventsAttendance(events, visits);

  assert.equal(analysis.allTimeBestEvent?.title, "Großes Sommerfest");
  assert.equal(analysis.allTimeBestEvent?.total, 10);

  // Kicker-Turniere: 2 events with 2 + 4 = 6 visits, average = 3.0
  const kickerGroup = analysis.eventGroups.find((g) => g.label === "Kicker-Turniere");
  assert.ok(kickerGroup);
  assert.equal(kickerGroup?.eventCount, 2);
  assert.equal(kickerGroup?.totalVisits, 6);
  assert.equal(kickerGroup?.averageVisits, 3.0);
  assert.equal(kickerGroup?.bestEvent?.total, 4);

  // Best group by average should be "Feste & Partys" (10 visits / 1 event = 10.0)
  assert.equal(analysis.bestEventGroup?.label, "Feste & Partys");
  assert.equal(analysis.bestEventGroup?.averageVisits, 10);
});
