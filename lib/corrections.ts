import { v5 } from "uuid";
import { dayKey, type TrackEvent } from "./tracking.ts";
import { eventKey, readRecords } from "./sync-state.ts";
import type { Correction } from "./correction-types.ts";

// All browsers restoring the same cancelled visit create the same new visit ID.
// Tombstones remain permanent, including after repeated Undo → Redo → Undo cycles.
export const redoId = (visitId: string) => v5(`chaxterlog:redo:${visitId}`, v5.URL);
export function latestRedo(storage: Storage, day = dayKey()) {
  const records = readRecords(storage);
  const restored = new Set(records.map((event) => event.redoOf).filter(Boolean));
  return records.filter((event) => event.cancelled && dayKey(new Date(event.timestamp)) === day && !restored.has(event.id) && event.corrections?.some((item) => item.kind === "undo"))
    .sort((a, b) => {
      const last = (event: TrackEvent) => Math.max(...(event.corrections ?? []).filter((item) => item.kind === "undo").map((item) => item.order ?? Date.parse(item.timestamp)));
      return last(b) - last(a) || b.id.localeCompare(a.id);
    })[0] ?? null;
}
export function redoLastClick(storage: Storage, correction: Correction, day = dayKey()): TrackEvent | null {
  const original = latestRedo(storage, day);
  if (!original) return null;
  const restored: TrackEvent = {
    ...original, id: redoId(original.id), redoOf: original.id,
    order: correction.order ?? Date.parse(correction.timestamp),
    userId: correction.userId, username: correction.username, deviceId: correction.deviceId,
    deviceName: correction.deviceName, platform: correction.platform, legacy: false,
    corrections: [correction],
  };
  storage.setItem(eventKey(restored), JSON.stringify({ ...restored, cancelled: false, baseline: 0, activeRevision: undefined, confirmed: undefined, synced: false }));
  return restored;
}
export type CorrectionEntry = Correction & { visitId: string; group: TrackEvent["group"]; visitTimestamp: string };
export function correctionEntries(events: TrackEvent[]): CorrectionEntry[] {
  const entries = new Map<string, CorrectionEntry>();
  for (const event of events) for (const item of event.corrections ?? []) entries.set(item.id, { ...item, visitId: event.id, group: event.group, visitTimestamp: event.timestamp });
  return [...entries.values()].sort((a, b) => (b.order ?? Date.parse(b.timestamp)) - (a.order ?? Date.parse(a.timestamp)) || b.id.localeCompare(a.id));
}
