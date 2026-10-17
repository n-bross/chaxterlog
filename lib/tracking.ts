import { isUuid, isCorrection, type Correction } from "./correction-types.ts";
export type AgeGroup = "u15" | "o15";
export type TrackEvent = {
  id: string;
  group: AgeGroup;
  timestamp: string;
  order?: number;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  userId?: string;
  username?: string;
  legacy?: boolean;
  redoOf?: string;
  corrections?: Correction[];
};
export type Counts = Record<AgeGroup, number>;
export const STORAGE_PREFIX = "chaxterlog:event:";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
});

// The café's calendar day, also when the device is set to another time zone.
export function dayKey(date: Date = new Date()): string {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isTrackEvent(value: unknown): value is TrackEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return isUuid(event.id)
    && (event.group === "u15" || event.group === "o15")
    && typeof event.timestamp === "string"
    && (event.order === undefined || (typeof event.order === "number" && Number.isFinite(event.order)))
    && Number.isFinite(Date.parse(event.timestamp))
    && ["deviceId", "deviceName", "platform", "userId", "username"].every((key) => event[key] === undefined || (typeof event[key] === "string" && event[key].length <= 100))
    && (event.deviceId === undefined || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.deviceId as string))
    && (event.legacy === undefined || typeof event.legacy === "boolean")
    && (event.redoOf === undefined || isUuid(event.redoOf))
    && (event.corrections === undefined || Array.isArray(event.corrections) && event.corrections.length <= 100 && event.corrections.every(isCorrection));
}

// A separate key per click prevents simultaneous tabs from overwriting each other.
export function readDay(storage: Storage, day = dayKey()) {
  const counts: Counts = { u15: 0, o15: 0 };
  let latest: { key: string; event: TrackEvent } | null = null;
  const prefix = `${STORAGE_PREFIX}${day}:`;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const event: unknown = JSON.parse(raw);
      if (isTrackEvent(event) && !(event as TrackEvent & { cancelled?: boolean }).cancelled && dayKey(new Date(event.timestamp)) === day) {
        counts[event.group]++;
        const order = event.order ?? Date.parse(event.timestamp);
        if (!latest || order >= (latest.event.order ?? Date.parse(latest.event.timestamp))) {
          latest = { key, event };
        }
      }
    } catch { /* Ignore malformed entries; never erase saved clicks. */ }
  }
  return { counts, latest };
}

export function readCounts(storage: Storage, day = dayKey()): Counts {
  return readDay(storage, day).counts;
}

export function readEvents(storage: Storage): TrackEvent[] {
  const events: TrackEvent[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const event: unknown = JSON.parse(raw);
      if (isTrackEvent(event) && !(event as TrackEvent & { cancelled?: boolean }).cancelled) events.push(event);
    } catch { /* Keep corrupt entries untouched; display valid visits. */ }
  }
  return events.sort((a, b) => (b.order ?? Date.parse(b.timestamp)) - (a.order ?? Date.parse(a.timestamp)));
}

// Read again at the moment of undo, so a stale tab does not undo an older click.
export function undoLastClick(storage: Storage, day = dayKey(), correction?: Correction): TrackEvent | null {
  const { latest } = readDay(storage, day);
  if (!latest) return null;
  storage.setItem(latest.key, JSON.stringify({ ...latest.event, cancelled: true, synced: false, ...(correction ? { corrections: [...latest.event.corrections ?? [], correction] } : {}) }));
  return latest.event;
}
