import { database } from "./database";
export async function adminOverview() {
  const sql = database();
  const [users, devices, summary] = await Promise.all([
    sql`SELECT id, name, username, role, banned, "createdAt" FROM "user" ORDER BY "createdAt"`,
    sql`SELECT * FROM chaxter_devices ORDER BY last_seen DESC`,
    sql`SELECT count(*) FILTER (WHERE NOT cancelled)::int AS total, count(*) FILTER (WHERE cancelled)::int AS cancelled,
      count(*) FILTER (WHERE NOT cancelled AND (occurred_at AT TIME ZONE 'Europe/Berlin')::date = (now() AT TIME ZONE 'Europe/Berlin')::date)::int AS today FROM chaxter_visits`,
  ]);
  return { users, devices, summary: summary[0] };
}
