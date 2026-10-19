import { eventKey, isVisitRecord, readRecords, type VisitRecord } from "./sync-state.ts";
import { dayKey } from "./tracking.ts";
export const LOCAL_CHANGE = "chaxterlog:local-change";
export class SyncError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export type Acknowledgement = { id: string; cancelled: boolean; date: string; revision: number };
export type Upload = (records: VisitRecord[]) => Promise<Acknowledgement[]>;
export function orderedPending(records: VisitRecord[]) {
  const pending = records.filter((event) => !event.synced);
  const byId = new Map(pending.map((event) => [event.id, event]));
  const result: VisitRecord[] = [], seen = new Set<string>(), visiting = new Set<string>();
  function add(event: VisitRecord) {
    if (seen.has(event.id)) return;
    if (visiting.has(event.id)) throw new Error("Zyklische Redo-Abhängigkeit.");
    visiting.add(event.id);
    const parent = event.redoOf ? byId.get(event.redoOf) : undefined;
    if (parent) add(parent);
    visiting.delete(event.id); seen.add(event.id); result.push(event);
  }
  pending.forEach(add);
  return result;
}
export function pendingDelta(event: VisitRecord, revision: number) {
  const confirmed = event.confirmed && event.confirmed.revision <= revision ? event.confirmed.cancelled ? 0 : 1 : event.activeRevision !== undefined && event.activeRevision <= revision ? 1 : event.baseline ?? 0;
  return (event.cancelled ? 0 : 1) - confirmed;
}
const intent = (event: VisitRecord) => JSON.stringify([event.cancelled, (event.corrections ?? []).map((c) => c.id)]);
export async function synchronize(storage: Storage, upload: Upload, device?: { id: string; name: string; platform: string }, actorId?: string) {
  const pending = orderedPending(readRecords(storage)).map((event) => device && !event.deviceId ? { ...event, deviceId: device.id, deviceName: device.name, platform: device.platform, legacy: event.legacy === true || !event.userId } : event);
  if (pending.some((event) => (!event.legacy && event.userId && event.userId !== actorId && !event.baseline) || event.corrections?.some((c) => c.userId && c.userId !== actorId))) throw new SyncError(409, "Offene Klicks gehören zu einem anderen Benutzer. Bitte mit diesem Konto anmelden.");
  for (let i = 0; i < pending.length;) {
    const batch: VisitRecord[] = []; let size = 0;
    while (i < pending.length && batch.length < 100) {
      const length = JSON.stringify(pending[i]).length + 1;
      if (length > 110_000) throw new Error("Ein Klick ist zu groß zum Synchronisieren.");
      if (batch.length && size + length > 110_000) break;
      batch.push(pending[i++]); size += length;
    }
    // Local acknowledgement state never crosses the network.
    const wire = batch.map(({ synced, baseline, activeRevision, confirmed, ...event }) => event);
    const acknowledgements = await upload(wire);
    for (const sent of batch) {
      const ack = acknowledgements.find((a) => a.id === sent.id);
      if (!ack) throw new Error("Empfangsbestätigung fehlt.");
      const key = eventKey(sent), current: unknown = JSON.parse(storage.getItem(key) ?? "null");
      if (!isVisitRecord(current) || current.confirmed && current.confirmed.revision > ack.revision) continue;
      const unchanged = intent(current) === intent(sent);
      storage.setItem(key, JSON.stringify({ ...current, cancelled: current.cancelled || ack.cancelled, synced: unchanged, ...(!ack.cancelled ? { activeRevision: current.activeRevision ?? ack.revision } : {}), confirmed: { cancelled: ack.cancelled, revision: ack.revision } }));
    }
  }
  return readRecords(storage).filter((event) => !event.synced).length;
}
export type DailySnapshot = { date: string; epoch?: string; u15: number; o15: number; revision: number; targets: VisitRecord[] };
const snapshotKey = (date: string) => `chaxterlog:daily:v1:${date}`;
export function applySnapshot(storage: Storage, snapshot: DailySnapshot) {
  const old = readSnapshot(storage, snapshot.date);
  const changedDatabase = !!old && old.epoch !== snapshot.epoch;
  if (old && !changedDatabase && old.revision > snapshot.revision) return;
  // Only pending clicks and the three current correction targets remain locally.
  for (const record of readRecords(storage)) {
    if (dayKey(new Date(record.timestamp)) !== snapshot.date) continue;
    if (record.synced && (changedDatabase || !record.confirmed || record.confirmed.revision <= snapshot.revision)) storage.removeItem(eventKey(record));
  }
  for (const remote of snapshot.targets) {
    const raw = storage.getItem(eventKey(remote));
    if (raw) continue; // Never overwrite a pending action or newer acknowledgement.
    storage.setItem(eventKey(remote), JSON.stringify({ ...remote, baseline: remote.cancelled ? 0 : 1, synced: true }));
  }
  storage.setItem(snapshotKey(snapshot.date), JSON.stringify(snapshot));
}
export function readSnapshot(storage: Storage, date: string): DailySnapshot | null {
  const value = storage.getItem(snapshotKey(date));
  if (!value) return null;
  try { return JSON.parse(value) as DailySnapshot; } catch { return null; }
}
export function displayCounts(storage: Storage, date: string) {
  const snapshot = readSnapshot(storage, date);
  const counts = { u15: snapshot?.u15 ?? 0, o15: snapshot?.o15 ?? 0 };
  for (const event of readRecords(storage)) if (dayKey(new Date(event.timestamp)) === date && (!event.synced || event.confirmed && event.confirmed.revision > (snapshot?.revision ?? 0))) counts[event.group] += pendingDelta(event, snapshot?.revision ?? 0);
  return { u15: Math.max(0, counts.u15), o15: Math.max(0, counts.o15) };
}
