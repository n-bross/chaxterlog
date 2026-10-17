import assert from "node:assert/strict";
import test from "node:test";
import { readCounts, STORAGE_PREFIX, type TrackEvent } from "./tracking.ts";
import { eventKey, mergeRemote, queueVisit, readRecords, type VisitRecord } from "./sync-state.ts";
import { synchronize, type Fetcher } from "./sync.ts";

function storageMock(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); }, clear: () => data.clear(),
  };
}
const visit = (i: number, group: "u15" | "o15" = "u15"): TrackEvent => ({ id: `e3d907b1-05aa-4eac-89a0-${String(i).padStart(12, "0")}`, group, timestamp: "2026-10-17T12:00:00.000Z", order: i });
function server() {
  const records = new Map<string, VisitRecord>();
  const fetcher: Fetcher = async (_url, init) => {
    if (init?.method === "POST") {
      const incoming = JSON.parse(String(init.body)).records as VisitRecord[];
      const saved = incoming.map((event) => {
        const previous = records.get(event.id);
        const result = { ...(previous ?? event), cancelled: event.cancelled || previous?.cancelled === true };
        records.set(event.id, result);
        return result;
      });
      return Response.json({ persisted: true, records: saved });
    }
    return Response.json({ records: [...records.values()] });
  };
  return { records, fetcher };
}

test("two isolated browsers migrate old data, share new clicks and deduplicate retries", async () => {
  const a = storageMock(), b = storageMock(), backend = server();
  a.setItem(eventKey(visit(1)), JSON.stringify(visit(1))); // Existing local-only installation.
  b.setItem(eventKey(visit(1)), JSON.stringify(visit(1))); // Same event copied previously.
  b.setItem("unrelated", "keep");
  queueVisit(b, visit(2, "o15"));
  await Promise.all([synchronize(a, backend.fetcher), synchronize(b, backend.fetcher)]);
  await synchronize(a, backend.fetcher);
  await synchronize(b, backend.fetcher);
  assert.deepEqual(readCounts(a, "2026-10-17"), { u15: 1, o15: 1 });
  assert.deepEqual(readCounts(b, "2026-10-17"), { u15: 1, o15: 1 });
  assert.equal(backend.records.size, 2);
  assert.equal(b.getItem("unrelated"), "keep");
  assert.ok(readRecords(a).every((event) => event.synced));
});

test("remote Undo wins over delayed offline uploads and survives reload", async () => {
  const a = storageMock(), b = storageMock(), backend = server();
  queueVisit(a, visit(1));
  await synchronize(a, backend.fetcher);
  await synchronize(b, backend.fetcher);
  queueVisit(a, visit(1), true);
  await synchronize(a, backend.fetcher);
  queueVisit(b, visit(1)); // Stale offline browser replays the original click.
  await synchronize(b, backend.fetcher);
  assert.deepEqual(readCounts(b, "2026-10-17"), { u15: 0, o15: 0 });
  assert.equal(readRecords(b)[0].cancelled, true);
  assert.equal(readRecords(b)[0].synced, true);
  await synchronize(b, backend.fetcher);
  assert.equal(backend.records.get(visit(1).id)?.cancelled, true);
});

test("failed requests keep the queue durable, then replay it exactly once", async () => {
  const storage = storageMock(), backend = server();
  queueVisit(storage, visit(1));
  await assert.rejects(synchronize(storage, async () => Response.json({}, { status: 503 })));
  assert.equal(readRecords(storage)[0].synced, false);
  assert.deepEqual(readCounts(storage, "2026-10-17"), { u15: 1, o15: 0 });
  await synchronize(storage, backend.fetcher);
  await synchronize(storage, backend.fetcher);
  assert.equal(backend.records.size, 1);
});

test("an Undo made while POST is in flight is not overwritten by the acknowledgement", async () => {
  const storage = storageMock(), backend = server();
  queueVisit(storage, visit(1));
  let intercepted = false;
  const fetcher: Fetcher = async (url, init) => {
    const response = await backend.fetcher(url, init);
    if (init?.method === "POST" && !intercepted) {
      intercepted = true;
      queueVisit(storage, visit(1), true);
    }
    return response;
  };
  assert.equal(await synchronize(storage, fetcher), 1);
  assert.equal(readRecords(storage)[0].cancelled, true);
  await synchronize(storage, backend.fetcher);
  assert.equal(backend.records.get(visit(1).id)?.cancelled, true);
});

test("migration uploads more than one batch and retains dates and times", async () => {
  const storage = storageMock(), backend = server();
  for (let i = 1; i <= 405; i++) queueVisit(storage, visit(i));
  await synchronize(storage, backend.fetcher);
  assert.equal(backend.records.size, 405);
  assert.equal(readRecords(storage)[404].timestamp, visit(405).timestamp);
  assert.ok(readRecords(storage).every((event) => event.synced));
});

test("remote merge preserves unsent clicks and ignores malformed legacy entries", () => {
  const storage = storageMock();
  storage.setItem(`${STORAGE_PREFIX}corrupt`, "{broken");
  queueVisit(storage, visit(1));
  mergeRemote(storage, [{ ...visit(2), cancelled: false }]);
  assert.equal(readRecords(storage).length, 2);
  assert.equal(readRecords(storage).find((event) => event.id === visit(1).id)?.synced, false);
});

test("old stub responses cannot falsely acknowledge queued visits", async () => {
  const storage = storageMock();
  queueVisit(storage, visit(1));
  await assert.rejects(synchronize(storage, async () => Response.json({ accepted: true, persisted: false })));
  assert.equal(readRecords(storage)[0].synced, false);
});


test("legacy migration adds its browser device without inventing the original user", async () => {
  const storage = storageMock(), backend = server();
  storage.setItem(eventKey(visit(1)), JSON.stringify(visit(1)));
  await synchronize(storage, backend.fetcher, { id: visit(2).id, name: "Kasse", platform: "Android / Chrome" });
  const saved = backend.records.get(visit(1).id)!;
  assert.equal(saved.deviceName, "Kasse");
  assert.equal(saved.legacy, true);
  assert.equal(saved.userId, undefined);
});

test("lost acknowledgement after server commit retries with the same ID", async () => {
  const storage = storageMock(), backend = server();
  queueVisit(storage, visit(1));
  await assert.rejects(synchronize(storage, async (url, init) => {
    await backend.fetcher(url, init);
    throw new Error("connection lost after commit");
  }));
  assert.equal(readRecords(storage)[0].synced, false);
  assert.equal(backend.records.size, 1);
  await synchronize(storage, backend.fetcher);
  assert.equal(backend.records.size, 1);
  assert.equal(readRecords(storage)[0].synced, true);
});
