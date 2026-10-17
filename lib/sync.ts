import { isVisitRecord, mergeRemote, readRecords, type VisitRecord } from "./sync-state.ts";

export const LOCAL_CHANGE = "chaxterlog:local-change";
export class SyncError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function request(fetcher: Fetcher, init?: RequestInit): Promise<VisitRecord[]> {
  const response = await fetcher("/api/track", { ...init, cache: "no-store" });
  if (!response.ok) {
    let message = `Sync HTTP ${response.status}`;
    if (response.status === 409) {
      try { message = (await response.json()).error ?? message; } catch { /* Preserve status. */ }
    }
    throw new SyncError(response.status, message);
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("records" in data) || !Array.isArray(data.records) || !data.records.every(isVisitRecord)) throw new Error("Invalid sync response");
  return data.records;
}

export async function synchronize(storage: Storage, fetcher: Fetcher, device?: { id: string; name: string; platform: string }) {
  const all = readRecords(storage);
  const pending = all.filter((event) => !event.synced).map((event) => {
    if (device && !event.deviceId) return { ...event, deviceId: device.id, deviceName: device.name, platform: device.platform, legacy: true };
    return event;
  });
  const byId = new Map(pending.map((event) => [event.id, event]));
  const depth = (event: VisitRecord) => {
    let level = 0, current = event;
    const seen = new Set<string>();
    while (current.redoOf && byId.has(current.redoOf) && !seen.has(current.id)) { seen.add(current.id); current = byId.get(current.redoOf)!; level++; }
    return level;
  };
  pending.sort((a, b) => depth(a) - depth(b));
  for (let i = 0; i < pending.length;) {
    const batch: VisitRecord[] = [];
    let size = 0;
    while (i < pending.length && batch.length < 200) {
      const length = JSON.stringify(pending[i]).length + 1;
      if (batch.length && size + length > 150_000) break;
      batch.push(pending[i++]); size += length;
    }
    const records = await request(fetcher, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: batch }) });
    mergeRemote(storage, records);
  }
  const remote = await request(fetcher);
  mergeRemote(storage, remote);
  return readRecords(storage).filter((event) => !event.synced).length;
}
