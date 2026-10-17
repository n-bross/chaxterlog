import { database } from "./database";

export interface SupportReport {
  id: string;
  created_at: string;
  user_id: string | null;
  username: string | null;
  device_id: string | null;
  device_name: string | null;
  platform: string | null;
  notes: string;
  user_agent: string;
  app_version: string;
  is_online: boolean;
  unsynced_count: number;
  today_counts: { u15: number; o15: number } | null;
  queue_sample: unknown[] | null;
  system_info: Record<string, unknown> | null;
  resolved: boolean;
}

export async function adminOverview() {
  const sql = database();
  const [users, devices, summary, reports] = await Promise.all([
    sql`SELECT id, name, username, role, banned, "createdAt" FROM "user" ORDER BY "createdAt"`,
    sql`SELECT * FROM chaxter_devices ORDER BY last_seen DESC`,
    sql`SELECT count(*) FILTER (WHERE NOT cancelled)::int AS total, count(*) FILTER (WHERE cancelled)::int AS cancelled,
      count(*) FILTER (WHERE NOT cancelled AND (occurred_at AT TIME ZONE 'Europe/Berlin')::date = (now() AT TIME ZONE 'Europe/Berlin')::date)::int AS today FROM chaxter_visits`,
    sql`SELECT * FROM chaxter_support_reports ORDER BY created_at DESC LIMIT 50`,
  ]);
  return { users, devices, summary: summary[0], reports: (reports as SupportReport[]) ?? [] };
}
