import assert from "node:assert/strict";
import test from "node:test";
import { dayKey, undoLastClick, type TrackEvent } from "./tracking.ts";
import { eventKey, queueVisit, readRecords, type VisitRecord } from "./sync-state.ts";
import { applySnapshot, displayCounts, orderedPending, synchronize, type Upload } from "./sync.ts";
import { redoLastClick } from "./corrections.ts";
function storageMock(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); }, clear: () => data.clear() };
}
const day = "2026-10-17";
const visit = (i: number): TrackEvent => ({ id: `e3d907b1-05aa-4eac-89a0-${String(i).padStart(12, "0")}`, group: "u15", timestamp: `${day}T12:00:00.000Z`, order: i });
const ack: Upload = async (records) => records.map((r) => ({ id: r.id, cancelled: r.cancelled, date: dayKey(new Date(r.timestamp)), revision: 1 }));
test("failed uploads and reload preserve the durable queue", async () => {
  const s = storageMock(); queueVisit(s, visit(1));
  await assert.rejects(synchronize(s, async () => { throw new Error("offline"); }));
  assert.equal(readRecords(s)[0].synced, false);
  await synchronize(s, ack); assert.equal(readRecords(s)[0].synced, true);
});
test("acknowledgement keeps optimistic counts until the daily revision arrives", async () => {
  const s = storageMock(); applySnapshot(s, { date: day, u15: 5, o15: 0, revision: 0, targets: [] }); queueVisit(s, visit(1));
  assert.equal(displayCounts(s, day).u15, 6);
  await synchronize(s, ack); assert.equal(displayCounts(s, day).u15, 6);
  applySnapshot(s, { date: day, u15: 6, o15: 0, revision: 1, targets: [{ ...visit(1), cancelled: false }] });
  assert.equal(displayCounts(s, day).u15, 6); assert.equal(readRecords(s).length, 1);
});
test("late acknowledgement cannot discard an undo written during the request", async () => {
  const s = storageMock(); queueVisit(s, visit(1));
  await synchronize(s, async (records) => { undoLastClick(s, day); return ack(records); });
  assert.equal(readRecords(s)[0].cancelled, true); assert.equal(readRecords(s)[0].synced, false);
  applySnapshot(s, { date: day, u15: 1, o15: 0, revision: 1, targets: [{ ...visit(1), cancelled: false }] });
  assert.equal(displayCounts(s, day).u15, 0);
  await synchronize(s, async (records) => (await ack(records)).map((a) => ({ ...a, revision: 2 })));
  applySnapshot(s, { date: day, u15: 0, o15: 0, revision: 2, targets: [] });
  assert.equal(displayCounts(s, day).u15, 0);
});
test("undo of a shared target subtracts one, and stale snapshots preserve pending actions", () => {
  const s = storageMock(), target = { ...visit(1), cancelled: false };
  applySnapshot(s, { date: day, u15: 10, o15: 2, revision: 3, targets: [target] }); undoLastClick(s, day);
  applySnapshot(s, { date: day, u15: 10, o15: 2, revision: 3, targets: [target] });
  assert.equal(displayCounts(s, day).u15, 9); assert.equal(readRecords(s)[0].synced, false);
  applySnapshot(s, { date: day, u15: 2, o15: 0, revision: 1, targets: [] }); assert.equal(displayCounts(s, day).u15, 9);
});
test("queue sorts dependent redo chains before batching, bounds count and bytes", async () => {
  const s = storageMock(); queueVisit(s, visit(1)); undoLastClick(s, day, { id: visit(900).id, kind: "undo", timestamp: visit(1).timestamp });
  const redo = redoLastClick(s, { id: visit(901).id, kind: "redo", timestamp: visit(1).timestamp }, day)!;
  const reversed = readRecords(s).reverse(); assert.deepEqual(orderedPending(reversed).map((r) => r.id), [visit(1).id, redo.id]);
  for (let i = 2; i < 250; i++) queueVisit(s, visit(i));
  const batches: VisitRecord[][] = [];
  await synchronize(s, async (batch) => { batches.push(batch); return ack(batch); });
  assert.ok(batches.flat().every((event) => !("baseline" in event) && !("confirmed" in event)));
  assert.ok(batches.length >= 3); assert.ok(batches.every((batch) => batch.length <= 100 && JSON.stringify(batch).length < 120_000));
  assert.equal(batches.flat().findIndex((r) => r.id === redo.id) > batches.flat().findIndex((r) => r.id === visit(1).id), true);
});
test("a lost acknowledgement retries the same UUID and preserves permanent cancellation", async () => {
  const s = storageMock(); queueVisit(s, visit(1), true); const seen = new Set<string>();
  await assert.rejects(synchronize(s, async (records) => { records.forEach((r) => seen.add(r.id)); throw new Error("lost response"); }));
  await synchronize(s, async (records) => { records.forEach((r) => seen.add(r.id)); return ack(records); });
  assert.equal(seen.size, 1); assert.equal(readRecords(s)[0].cancelled, true);
});
test("user switch refuses another user's pending visits and corrections", async () => {
  const s = storageMock(); queueVisit(s, { ...visit(1), userId: "first" });
  await assert.rejects(synchronize(s, ack, undefined, "second"), /anderen Benutzer/);
  await assert.rejects(synchronize(s, ack, { id: visit(999).id, name: "Tablet", platform: "Browser" }, "second"), /anderen Benutzer/);
  assert.equal(readRecords(s)[0].synced, false);
});
test("snapshot pruning leaves unrelated storage and pending queue intact", () => {
  const s = storageMock(); s.setItem("unrelated", "keep");
  for (let i = 1; i < 30; i++) s.setItem(eventKey(visit(i)), JSON.stringify({ ...visit(i), cancelled: false, synced: true }));
  queueVisit(s, visit(30)); applySnapshot(s, { date: day, u15: 29, o15: 0, revision: 1, targets: [{ ...visit(29), cancelled: false }] });
  assert.equal(readRecords(s).length, 2); assert.equal(s.getItem("unrelated"), "keep");
});

test("create then undo acknowledgements remain correct across an intermediate live revision", async () => {
  const s = storageMock(); applySnapshot(s, { date: day, u15: 0, o15: 0, revision: 0, targets: [] });
  queueVisit(s, visit(1)); await synchronize(s, ack); undoLastClick(s, day);
  await synchronize(s, async (records) => (await ack(records)).map((a) => ({ ...a, revision: 2 })));
  applySnapshot(s, { date: day, u15: 1, o15: 0, revision: 1, targets: [{ ...visit(1), cancelled: false }] });
  assert.equal(displayCounts(s, day).u15, 0);
  applySnapshot(s, { date: day, u15: 0, o15: 0, revision: 2, targets: [] });
  assert.equal(displayCounts(s, day).u15, 0);
});

test("an older response cannot regress a newer cancellation acknowledgement", async () => {
  const s = storageMock(); queueVisit(s, visit(1));
  let release!: () => void;
  const delayed = synchronize(s, async (records) => { await new Promise<void>((resolve) => { release = resolve; }); return ack(records); });
  undoLastClick(s, day);
  await synchronize(s, async (records) => (await ack(records)).map((a) => ({ ...a, revision: 2 })));
  release(); await delayed;
  assert.equal(readRecords(s)[0].synced, true); assert.equal(readRecords(s)[0].confirmed?.revision, 2);
});

test("a fresh database replaces a higher cached revision without deleting pending clicks", () => {
  const s = storageMock();
  applySnapshot(s, { date: day, epoch: "old", u15: 100, o15: 0, revision: 100, targets: [{ ...visit(1), cancelled: false }] });
  queueVisit(s, visit(2));
  applySnapshot(s, { date: day, epoch: "fresh", u15: 0, o15: 0, revision: 0, targets: [] });
  assert.equal(displayCounts(s, day).u15, 1); assert.deepEqual(readRecords(s).map((r) => r.id), [visit(2).id]);
});
