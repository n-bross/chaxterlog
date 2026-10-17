import { dayKey, isTrackEvent, STORAGE_PREFIX, type TrackEvent } from "./tracking.ts";

export type VisitRecord = TrackEvent & { cancelled: boolean; synced?: boolean };
export const eventKey = (event: TrackEvent) => `${STORAGE_PREFIX}${dayKey(new Date(event.timestamp))}:${event.id}`;

export function isVisitRecord(value: unknown): value is VisitRecord {
  return isTrackEvent(value) && typeof (value as VisitRecord).cancelled === "boolean";
}

// Older local-only records become pending uploads automatically, with their original IDs.
export function readRecords(storage: Storage): VisitRecord[] {
  const records = new Map<string, VisitRecord>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    try {
      const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
      if (isTrackEvent(value)) {
        const flags = value as VisitRecord;
        records.set(value.id, { ...value, cancelled: flags.cancelled === true, synced: flags.synced === true });
      }
    } catch { /* Never remove invalid or unrelated storage. */ }
  }
  return [...records.values()];
}

// A cancellation is a permanent tombstone: delayed uploads must never revive it.
export function queueVisit(storage: Storage, event: TrackEvent, cancelled = false) {
  const key = eventKey(event);
  const previous = storage.getItem(key);
  const value = previous ? JSON.parse(previous) as VisitRecord : null;
  storage.setItem(key, JSON.stringify({ ...event, cancelled: cancelled || value?.cancelled === true, synced: false }));
}

export function mergeRemote(storage: Storage, records: VisitRecord[]) {
  for (const remote of records) {
    const key = eventKey(remote);
    const raw = storage.getItem(key);
    const local = raw ? JSON.parse(raw) as VisitRecord : null;
    const cancelled = remote.cancelled || local?.cancelled === true;
    const acknowledged = new Set((remote.corrections ?? []).map((item) => item.id));
    const waiting = (local?.corrections ?? []).filter((item) => !acknowledged.has(item.id));
    const corrections = [...remote.corrections ?? [], ...waiting];
    const merged = { ...remote, cancelled, ...(corrections.length ? { corrections } : {}), synced: cancelled === remote.cancelled && waiting.length === 0 };
    const serialized = JSON.stringify(merged);
    if (serialized !== raw) storage.setItem(key, serialized);
  }
}
