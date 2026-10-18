import { randomUUID } from "node:crypto";
import { database } from "@/lib/database";
import { sessionFor } from "@/lib/access";

export const runtime = "nodejs";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const session = await sessionFor(request);
  const text = await request.text();
  if (text.length > 50000) return json({ error: "Diagnosedaten zu groß." }, 413);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: "Ungültiges JSON." }, 400);
  }

  const id = randomUUID();
  const userId = session?.user?.id ?? null;
  const username = session?.user?.username ?? session?.user?.name ?? null;
  const deviceId = typeof data.deviceId === "string" && data.deviceId.length === 36 ? data.deviceId : null;
  const deviceName = typeof data.deviceName === "string" ? data.deviceName.slice(0, 100) : "Unbekannt";
  const platform = typeof data.platform === "string" ? data.platform.slice(0, 50) : "Unbekannt";
  const notes = typeof data.notes === "string" ? data.notes.slice(0, 2000) : "";
  const userAgent = typeof data.userAgent === "string" ? data.userAgent.slice(0, 500) : "";
  const appVersion = typeof data.appVersion === "string" ? data.appVersion.slice(0, 50) : "";
  const isOnline = typeof data.isOnline === "boolean" ? data.isOnline : true;
  const unsyncedCount = typeof data.unsyncedCount === "number" ? Math.max(0, data.unsyncedCount) : 0;
  const todayCounts = data.todayCounts && typeof data.todayCounts === "object" ? JSON.stringify(data.todayCounts) : null;
  const queueSample = Array.isArray(data.queueSample) ? JSON.stringify(data.queueSample) : null;
  const systemInfo = data.systemInfo && typeof data.systemInfo === "object" ? JSON.stringify(data.systemInfo) : null;

  try {
    const sql = database();
    await sql`
      INSERT INTO chaxter_support_reports (
        id, user_id, username, device_id, device_name, platform,
        notes, user_agent, app_version, is_online, unsynced_count,
        today_counts, queue_sample, system_info
      ) VALUES (
        ${id}, ${userId}, ${username}, ${deviceId}, ${deviceName}, ${platform},
        ${notes}, ${userAgent}, ${appVersion}, ${isOnline}, ${unsyncedCount},
        ${todayCounts}::jsonb, ${queueSample}::jsonb, ${systemInfo}::jsonb
      )
    `;
    return json({ ok: true, id });
  } catch (error) {
    console.error("Support report insertion failed, attempting table verification/migration:", error);
    try {
      const sql = database();
      await sql`
        CREATE TABLE IF NOT EXISTS chaxter_support_reports (
          id uuid PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          user_id text,
          username text,
          device_id uuid,
          device_name text,
          platform text,
          notes text,
          user_agent text,
          app_version text,
          is_online boolean NOT NULL DEFAULT true,
          unsynced_count integer NOT NULL DEFAULT 0,
          today_counts jsonb,
          queue_sample jsonb,
          system_info jsonb,
          resolved boolean NOT NULL DEFAULT false
        )
      `;
      await sql`ALTER TABLE chaxter_support_reports ADD COLUMN IF NOT EXISTS user_agent text`;
      await sql`
        INSERT INTO chaxter_support_reports (
          id, user_id, username, device_id, device_name, platform,
          notes, user_agent, app_version, is_online, unsynced_count,
          today_counts, queue_sample, system_info
        ) VALUES (
          ${id}, ${userId}, ${username}, ${deviceId}, ${deviceName}, ${platform},
          ${notes}, ${userAgent}, ${appVersion}, ${isOnline}, ${unsyncedCount},
          ${todayCounts}::jsonb, ${queueSample}::jsonb, ${systemInfo}::jsonb
        )
      `;
      return json({ ok: true, id });
    } catch (retryError) {
      console.error("Support report retry insertion failed:", retryError);
      return json({ error: "Konnte Diagnosebericht nicht speichern." }, 500);
    }
  }
}
