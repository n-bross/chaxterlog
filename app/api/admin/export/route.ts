import { sessionFor } from "@/lib/access";
import { database } from "@/lib/database";
import { csv, validDay } from "@/lib/export";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await sessionFor(request);
  if (!session) return new Response(null, { status: 401 });
  if (session.user.role !== "admin") return new Response(null, { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from") || "2000-01-01", to = params.get("to") || "2099-12-31";
  const format = params.get("format") || "csv";
  if (!validDay(from) || !validDay(to) || from > to || !["csv", "daily", "json", "corrections"].includes(format)) return Response.json({ error: "Ungültiger Zeitraum oder Dateityp." }, { status: 400 });
  const rows = await database()`SELECT *, to_char(occurred_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
    to_char(occurred_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI:SS') AS time
    FROM chaxter_visits WHERE (occurred_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN ${from}::date AND ${to}::date ORDER BY occurred_at, id`;
  const corrections = format === "json" || format === "corrections" ? await database()`SELECT c.*, v.age_group, v.occurred_at AS visit_time, v.redo_of,
    to_char(c.occurred_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
    to_char(c.occurred_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI:SS') AS time
    FROM chaxter_corrections c JOIN chaxter_visits v ON v.id=c.visit_id
    WHERE (c.occurred_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN ${from}::date AND ${to}::date ORDER BY c.occurred_at, c.id` : [];
  let body: string;
  if (format === "json") body = JSON.stringify({ exportedAt: new Date().toISOString(), timezone: "Europe/Berlin", from, to, records: rows, corrections }, null, 2);
  else if (format === "corrections") body = csv([["Aktions-ID", "Knopf", "Datum (Berlin)", "Uhrzeit (Berlin)", "Zeitpunkt (UTC)", "Benutzer", "Geräte-ID", "Gerät des Korrekturknopfs", "System / Browser", "Besuchs-ID", "Gruppe", "Ursprünglicher Besuch (UTC)", "Serverempfang (UTC)"], ...corrections.map((item) => [item.id, item.kind === "undo" ? "Undo" : "Redo", item.day, item.time, new Date(item.occurred_at).toISOString(), item.username, item.device_id, item.device_name, item.platform, item.visit_id, item.age_group === "u15" ? "U15" : "Ü15", new Date(item.visit_time).toISOString(), new Date(item.received_at).toISOString()])]);
  else if (format === "daily") {
    const days = new Map<string, { u15: number; o15: number }>();
    for (const row of rows) {
      if (row.cancelled) continue;
      const values = days.get(row.day) ?? { u15: 0, o15: 0 };
      values[row.age_group as "u15" | "o15"]++;
      days.set(row.day, values);
    }
    body = csv([["Datum (Europe/Berlin)", "U15", "Ü15", "Gesamt"], ...[...days].map(([day, values]) => [day, values.u15, values.o15, values.u15 + values.o15])]);
  } else body = csv([["ID", "Datum (Berlin)", "Uhrzeit (Berlin)", "Zeitpunkt (UTC)", "Gruppe", "Status", "Benutzer", "Geräte-ID", "Gerätename beim Klick", "System / Browser", "Altbestand", "Importiert von (Benutzer-ID)", "Storniert von", "Storniert um (UTC)", "Redo von Besuchs-ID"], ...rows.map((row) => [row.id, row.day, row.time, new Date(row.occurred_at).toISOString(), row.age_group === "u15" ? "U15" : "Ü15", row.cancelled ? "storniert" : "gezählt", row.username, row.device_id, row.device_name, row.platform, row.legacy ? "ja" : "nein", row.imported_by, row.cancelled_by, row.cancelled_at ? new Date(row.cancelled_at).toISOString() : "", row.redo_of])]);
  return new Response(body, { headers: {
    "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="chaxterlog-${format}-${from}-${to}.${format === "json" ? "json" : "csv"}"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
