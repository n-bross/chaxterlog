import { dayKey, isTrackEvent, STORAGE_PREFIX, type TrackEvent } from "./tracking.ts";

export type VisitRecord = TrackEvent & { cancelled: boolean; synced?: boolean; baseline?: number; activeRevision?: number; confirmed?: { cancelled: boolean; revision: number } };
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
  storage.setItem(key, JSON.stringify({ ...event, baseline: value?.baseline ?? (value?.synced && !value.cancelled ? 1 : 0), cancelled: cancelled || value?.cancelled === true, synced: false }));
}
