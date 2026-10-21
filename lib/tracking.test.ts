import assert from "node:assert/strict";
import test from "node:test";
import { atBerlinTime, dayKey, isTrackEvent, readCounts, undoLastClick, STORAGE_PREFIX } from "./tracking.ts";

const event = { id: "e3d907b1-05aa-4eac-89a0-34c7e514bc01", group: "u15", timestamp: "2026-10-17T12:00:00.000Z" };
function storageMock(entries: Record<string, string>): Storage {
  const data = new Map(Object.entries(entries));
  return {
    get length() { return data.size; },
    key: (index) => Array.from(data.keys())[index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
  };
}

test("Berlin day changes at local midnight, including summer and winter time", () => {
  assert.equal(dayKey(new Date("2026-07-01T21:59:59Z")), "2026-07-01");
  assert.equal(dayKey(new Date("2026-07-01T22:00:00Z")), "2026-07-02");
  assert.equal(dayKey(new Date("2026-12-01T22:59:59Z")), "2026-12-01");
  assert.equal(dayKey(new Date("2026-12-01T23:00:00Z")), "2026-12-02");
});

test("clicks for a past day keep the Berlin wall-clock time, across summer and winter time", () => {
  // 22:15 Berlin in summer, entered for a winter day: still 22:15 Berlin on that day.
  const summerEvening = new Date("2026-07-01T20:15:30.250Z");
  assert.equal(atBerlinTime("2026-12-01", summerEvening).toISOString(), "2026-12-01T21:15:30.250Z");
  assert.equal(atBerlinTime("2026-06-30", summerEvening).toISOString(), "2026-06-30T20:15:30.250Z");
  // Shortly after midnight stays on the chosen day rather than slipping into the next one.
  const afterMidnight = new Date("2026-10-20T22:05:00.000Z");
  assert.equal(dayKey(atBerlinTime("2026-10-19", afterMidnight)), "2026-10-19");
  // 02:30 does not exist on the spring change day; fall back to midday of that day.
  const halfPastTwo = new Date("2026-03-30T00:30:00.000Z");
  assert.equal(dayKey(atBerlinTime("2026-03-29", halfPastTwo)), "2026-03-29");
  assert.equal(atBerlinTime("2026-03-29", halfPastTwo).toISOString(), "2026-03-29T11:00:00.000Z");
});

test("payload validation rejects malformed and unsupported events", () => {
  assert.equal(isTrackEvent(event), true);
  for (const input of [null, [], {}, { ...event, id: "x" }, { ...event, group: "other" }, { ...event, timestamp: "invalid" }]) {
    assert.equal(isTrackEvent(input), false);
  }
});

test("counts today's groups, preserves history and ignores corrupt entries", () => {
  const storage = storageMock({
    [`${STORAGE_PREFIX}2026-10-17:a`]: JSON.stringify(event),
    [`${STORAGE_PREFIX}2026-10-17:b`]: JSON.stringify({ ...event, group: "o15" }),
    [`${STORAGE_PREFIX}2026-10-17:corrupt`]: "{broken",
    [`${STORAGE_PREFIX}2026-10-17:wrong-day`]: JSON.stringify({ ...event, timestamp: "2026-10-16T12:00:00Z" }),
    [`${STORAGE_PREFIX}2026-10-16:history`]: JSON.stringify({ ...event, timestamp: "2026-10-16T12:00:00Z" }),
    "other-app": "ignore",
  });
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 1 });
  assert.deepEqual(readCounts(storage, "2026-10-18"), { u15: 0, o15: 0 });
  assert.equal(storage.length, 6);
});

test("individual event keys preserve writes from separate tabs", () => {
  const storage = storageMock({});
  storage.setItem(`${STORAGE_PREFIX}2026-10-17:tab-a`, JSON.stringify(event));
  storage.setItem(`${STORAGE_PREFIX}2026-10-17:tab-b`, JSON.stringify({ ...event, group: "o15" }));
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 1 });
});

test("undo follows rapid mixed clicks in order, survives reload and stops at zero", () => {
  const storage = storageMock({
    [`${STORAGE_PREFIX}2026-10-16:history`]: JSON.stringify({ ...event, timestamp: "2026-10-16T12:00:00Z" }),
  });
  storage.setItem(`${STORAGE_PREFIX}2026-10-17:a`, JSON.stringify({ ...event, group: "u15", order: 10.1 }));
  storage.setItem(`${STORAGE_PREFIX}2026-10-17:b`, JSON.stringify({ ...event, group: "o15", order: 10.2 }));
  // Only the stored data is needed, so a new page load can also undo.
  assert.equal(undoLastClick(storage, "2026-10-17")?.group, "o15");
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 0 });
  assert.equal(undoLastClick(storage, "2026-10-17")?.group, "u15");
  assert.equal(undoLastClick(storage, "2026-10-17"), null);
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 0, o15: 0 });
  assert.equal(storage.length, 3); // History plus two durable Undo tombstones.
});

test("undo targeting a specific group subtracts only that group even with newer clicks in the other group", () => {
  const storage = storageMock({});
  storage.setItem(`${STORAGE_PREFIX}2026-10-17:1`, JSON.stringify({ ...event, group: "u15", order: 10.1 }));
  storage.setItem(`${STORAGE_PREFIX}2026-10-17:2`, JSON.stringify({ ...event, group: "o15", order: 10.2 }));
  storage.setItem(`${STORAGE_PREFIX}2026-10-17:3`, JSON.stringify({ ...event, group: "u15", order: 10.3 }));

  // Subtract U15 directly: should cancel event 3 (latest U15) while O15 remains 1
  assert.equal(undoLastClick(storage, "2026-10-17", undefined, "u15")?.order, 10.3);
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 1 });

  // Subtract O15 directly: should cancel event 2 (the only O15)
  assert.equal(undoLastClick(storage, "2026-10-17", undefined, "o15")?.order, 10.2);
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 0 });

  // Subtract O15 again: nothing left for O15, returns null and counts remain untouched
  assert.equal(undoLastClick(storage, "2026-10-17", undefined, "o15"), null);
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 0 });

  // Subtract remaining U15
  assert.equal(undoLastClick(storage, "2026-10-17", undefined, "u15")?.order, 10.1);
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 0, o15: 0 });
});

test("failed cancellation write leaves counts intact and reports an error", () => {
  const storage = storageMock({ [`${STORAGE_PREFIX}2026-10-17:a`]: JSON.stringify(event) });
  storage.setItem = () => { throw new Error("Storage blocked"); };
  assert.throws(() => undoLastClick(storage, "2026-10-17"), /Storage blocked/);
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 0 });
});
