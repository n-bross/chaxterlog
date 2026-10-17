import { neon } from "@neondatabase/serverless";
import type { Correction } from "./correction-types";
import type { VisitRecord } from "./sync-state";

type Row = { id: string; age_group: "u15" | "o15"; occurred_at: string; click_order: number; cancelled: boolean; device_id: string | null; device_name: string | null; platform: string | null; user_id: string | null; username: string | null; legacy: boolean; redo_of: string | null };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
}
const record = (row: Row): VisitRecord => ({ id: row.id, group: row.age_group, timestamp: new Date(row.occurred_at).toISOString(), order: Number(row.click_order), cancelled: row.cancelled,
  deviceId: row.device_id ?? undefined, deviceName: row.device_name ?? undefined, platform: row.platform ?? undefined,
  userId: row.user_id ?? undefined, username: row.username ?? undefined, legacy: row.legacy, redoOf: row.redo_of ?? undefined });

type CorrectionRow = { id: string; visit_id: string; kind: "undo" | "redo"; occurred_at: string; click_order: number; user_id: string | null; username: string | null; device_id: string | null; device_name: string | null; platform: string | null };
export async function listVisits(ids?: string[]): Promise<VisitRecord[]> {
  const sql = database();
  const [rows, actions] = await Promise.all([
    ids ? sql`SELECT * FROM chaxter_visits WHERE id=ANY(${ids}::uuid[])` : sql`SELECT * FROM chaxter_visits ORDER BY occurred_at, id`,
    ids ? sql`SELECT * FROM chaxter_corrections WHERE visit_id=ANY(${ids}::uuid[]) ORDER BY occurred_at,id` : sql`SELECT * FROM chaxter_corrections ORDER BY occurred_at,id`,
  ]);
  const byVisit = new Map<string, Correction[]>();
  for (const row of actions as CorrectionRow[]) {
    const correction: Correction = { id: row.id, kind: row.kind, timestamp: new Date(row.occurred_at).toISOString(), order: Number(row.click_order),
      userId: row.user_id ?? undefined, username: row.username ?? undefined, deviceId: row.device_id ?? undefined, deviceName: row.device_name ?? undefined, platform: row.platform ?? undefined };
    const items = byVisit.get(row.visit_id) ?? []; items.push(correction); byVisit.set(row.visit_id, items);
  }
  return (rows as Row[]).map((row) => ({ ...record(row), corrections: byVisit.get(row.id) ?? [] }));
}

export async function saveVisits(events: VisitRecord[], actor: { id: string; username: string }): Promise<VisitRecord[]> {
  const sql = database();
  const payload = events.map((event) => ({ id: event.id, age_group: event.group, occurred_at: event.timestamp,
    click_order: event.order ?? Date.parse(event.timestamp), cancelled: event.cancelled,
    device_id: event.deviceId ?? null, device_name: event.deviceName ?? null, platform: event.platform ?? null,
    user_id: event.legacy ? null : actor.id, username: event.legacy ? null : actor.username, legacy: event.legacy === true,
    imported_by: event.legacy ? actor.id : null, redo_of: event.redoOf ?? null }));
  const devices = [...new Map(events.filter((event) => event.deviceId).map((event) => [event.deviceId, { id: event.deviceId, name: event.deviceName ?? "Unbenannt", platform: event.platform ?? "Unbekannt" }])).values()];
  const actions = events.flatMap((event) => {
    const items = (event.corrections ?? []).map((item) => ({ ...item, legacyAction: false }));
    if (event.cancelled && !items.some((item) => item.kind === "undo")) items.push({ id: event.id, kind: "undo", timestamp: new Date().toISOString(), legacyAction: true });
    return items.map((item) => ({ id: item.id, visit_id: event.id, kind: item.kind, occurred_at: item.timestamp,
      click_order: item.order ?? Date.parse(item.timestamp), user_id: actor.id, username: actor.username,
      device_id: item.deviceId ?? null, device_name: item.deviceName ?? null, platform: item.platform ?? null, legacy_action: item.legacyAction }));
  });
  await sql.transaction([
    sql`INSERT INTO chaxter_devices (id, name, platform, last_user)
      SELECT id, name, platform, ${actor.username} FROM jsonb_to_recordset(${JSON.stringify(devices)}::jsonb) AS batch(id uuid, name text, platform text)
      ON CONFLICT (id) DO UPDATE SET last_seen = now(), last_user = EXCLUDED.last_user`,
    sql`INSERT INTO chaxter_visits (id, age_group, occurred_at, click_order, cancelled, device_id, device_name, platform, user_id, username, legacy, imported_by, cancelled_by, cancelled_at, redo_of)
      SELECT id, age_group, occurred_at, click_order, cancelled, device_id, device_name, platform, user_id, username, legacy, imported_by,
        CASE WHEN cancelled THEN ${actor.username} END, CASE WHEN cancelled THEN now() END, redo_of
      FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb)
        AS batch(id uuid, age_group text, occurred_at timestamptz, click_order double precision, cancelled boolean, device_id uuid, device_name text, platform text, user_id text, username text, legacy boolean, imported_by text, redo_of uuid)
      ON CONFLICT (id) DO UPDATE SET cancelled = chaxter_visits.cancelled OR EXCLUDED.cancelled,
        cancelled_by = CASE WHEN NOT chaxter_visits.cancelled AND EXCLUDED.cancelled THEN EXCLUDED.cancelled_by ELSE chaxter_visits.cancelled_by END,
        cancelled_at = CASE WHEN NOT chaxter_visits.cancelled AND EXCLUDED.cancelled THEN EXCLUDED.cancelled_at ELSE chaxter_visits.cancelled_at END
      RETURNING *`,
    sql`INSERT INTO chaxter_corrections (id,visit_id,kind,occurred_at,click_order,user_id,username,device_id,device_name,platform)
      SELECT batch.id,visit_id,kind,occurred_at,click_order,user_id,username,device_id,device_name,platform
      FROM jsonb_to_recordset(${JSON.stringify(actions)}::jsonb) AS batch(id uuid,visit_id uuid,kind text,occurred_at timestamptz,click_order double precision,user_id text,username text,device_id uuid,device_name text,platform text,legacy_action boolean)
      WHERE NOT legacy_action OR NOT EXISTS (SELECT 1 FROM chaxter_corrections old WHERE old.visit_id=batch.visit_id AND old.kind='undo')
      ON CONFLICT (id) DO NOTHING`,
  ]);
  return listVisits(events.map((event) => event.id));
}

export type EventRow = {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
};

export async function listEvents(from?: string, to?: string) {
  const sql = database();
  let rows: EventRow[];
  if (from && to) {
    rows = (await sql`SELECT id, event_date::text, title, description, created_at, created_by FROM chaxter_events WHERE event_date >= ${from}::date AND event_date <= ${to}::date ORDER BY event_date ASC, created_at ASC`) as EventRow[];
  } else {
    rows = (await sql`SELECT id, event_date::text, title, description, created_at, created_by FROM chaxter_events ORDER BY event_date ASC, created_at ASC`) as EventRow[];
  }
  return rows.map((r) => ({
    id: r.id,
    date: r.event_date.slice(0, 10),
    title: r.title,
    description: r.description ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by ?? undefined,
  }));
}

export async function saveEvents(
  items: { id?: string; date: string; title: string; description?: string }[],
  actor: { id: string; username: string }
) {
  const sql = database();
  if (items.length === 0) return [];
  const payload = items.map((item) => ({
    id: item.id || crypto.randomUUID(),
    event_date: item.date,
    title: item.title,
    description: item.description ?? null,
    created_by: actor.username,
  }));

  await sql`
    INSERT INTO chaxter_events (id, event_date, title, description, created_by)
    SELECT id, event_date::date, title, description, created_by
    FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb)
      AS batch(id uuid, event_date text, title text, description text, created_by text)
    ON CONFLICT (id) DO UPDATE SET
      event_date = EXCLUDED.event_date,
      title = EXCLUDED.title,
      description = EXCLUDED.description
  `;

  return listEvents();
}

export async function deleteEvent(id: string): Promise<boolean> {
  const sql = database();
  const res = await sql`DELETE FROM chaxter_events WHERE id = ${id}::uuid RETURNING id`;
  return res.length > 0;
}
