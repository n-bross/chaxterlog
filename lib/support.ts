import { getDevice } from "./device";
import { readRecords, type VisitRecord } from "./sync-state";
import { displayCounts } from "./sync";
import { dayKey } from "./tracking";

export interface DiagnosticPayload {
  notes?: string;
  appVersion?: string;
  isOnline: boolean;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  userAgent: string;
  unsyncedCount: number;
  todayCounts: { u15: number; o15: number };
  queueSample: Array<{
    id: string;
    group: string;
    timestamp: string;
    synced: boolean;
    cancelled: boolean;
    redoOf?: string;
  }>;
  systemInfo: {
    screenWidth: number;
    screenHeight: number;
    devicePixelRatio: number;
    viewportWidth: number;
    viewportHeight: number;
    connectionType?: string;
    timezone: string;
    timestamp: string;
  };
}

export function collectDiagnostics(notes?: string): DiagnosticPayload {
  let device;
  try {
    device = getDevice();
  } catch {
    // fallback if localStorage is disabled
  }

  let records: VisitRecord[] = [];
  try {
    records = readRecords(typeof localStorage !== "undefined" ? localStorage : ({} as Storage));
  } catch {
    // fallback
  }

  const unsynced = records.filter((r) => !r.synced);
  const today = dayKey();
  let todayCounts = { u15: 0, o15: 0 };
  for (const r of records) {
    if (dayKey(new Date(r.timestamp)) === today && !r.cancelled) {
      if (r.group === "u15") todayCounts.u15++;
      if (r.group === "o15") todayCounts.o15++;
    }
  }

  try { if (typeof localStorage !== "undefined") todayCounts = displayCounts(localStorage, today); } catch { /* Keep diagnostic fallback when storage is unavailable. */ }

  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const win = typeof window !== "undefined" ? window : undefined;

  // @ts-expect-error network connection API
  const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection;

  return {
    notes: notes?.trim() || "",
    appVersion: typeof document !== "undefined" ? document.documentElement.dataset.version || "1.0.0" : "1.0.0",
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    deviceId: device?.id,
    deviceName: device?.name,
    platform: device?.platform,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    unsyncedCount: unsynced.length,
    todayCounts,
    queueSample: unsynced.slice(0, 20).map((r) => ({
      id: r.id,
      group: r.group,
      timestamp: r.timestamp,
      synced: Boolean(r.synced),
      cancelled: Boolean(r.cancelled),
      redoOf: r.redoOf,
    })),
    systemInfo: {
      screenWidth: win?.screen?.width ?? 0,
      screenHeight: win?.screen?.height ?? 0,
      devicePixelRatio: win?.devicePixelRatio ?? 1,
      viewportWidth: win?.innerWidth ?? 0,
      viewportHeight: win?.innerHeight ?? 0,
      connectionType: connection?.effectiveType || connection?.type || "unknown",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function sendDiagnosticReport(notes?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const payload = collectDiagnostics(notes);
  try {
    const { convex } = await import("./convex-client");
    const { api } = await import("@/convex/_generated/api");
    return await convex.mutation(api.support.send, { payload: JSON.stringify(payload) });
  } catch { return { ok: false, error: "Fehler beim Senden des Diagnoseberichts." }; }
}
