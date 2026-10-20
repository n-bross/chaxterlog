import { fetchQuery } from "convex/nextjs";
import { getToken } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import { csv, validDay } from "@/lib/export";
import { dayKey } from "@/lib/tracking";
export const runtime = "nodejs";
type Row = Record<string, unknown>;
const time = (timestamp: unknown) => new Date(String(timestamp)).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour12: false });
const date = (timestamp: unknown) => dayKey(new Date(String(timestamp)));
const columns = {
  daily: ["Datum (Europe/Berlin)", "U15", "Ü15", "Gesamt"],
  csv: ["ID", "Datum (Berlin)", "Uhrzeit (Berlin)", "Zeitpunkt (UTC)", "Gruppe", "Status", "Benutzer", "Geräte-ID", "Gerätename beim Klick", "System / Browser", "Altbestand", "Importiert von", "Storniert von", "Storniert um (UTC)", "Redo von Besuchs-ID"],
  corrections: ["Aktions-ID", "Knopf", "Datum (Berlin)", "Uhrzeit (Berlin)", "Zeitpunkt (UTC)", "Benutzer", "Geräte-ID", "Gerät des Korrekturknopfs", "System / Browser", "Besuchs-ID", "Gruppe", "Ursprünglicher Besuch (UTC)", "Serverempfang (UTC)"],
};
function cells(format: "csv" | "daily" | "corrections", row: Row) {
  if (format === "daily") return [row.date, row.u15, row.o15, Number(row.u15) + Number(row.o15)];
  if (format === "corrections") return [row.id, row.kind === "undo" ? "Undo" : "Redo", date(row.timestamp), time(row.timestamp), row.timestamp, row.username, row.deviceId, row.deviceName, row.platform, row.visitId, row.group === "u15" ? "U15" : "Ü15", row.visitTimestamp, row.receivedAt];
  return [row.id, date(row.timestamp), time(row.timestamp), row.timestamp, row.group === "u15" ? "U15" : "Ü15", row.cancelled ? "storniert" : "gezählt", row.username, row.deviceId, row.deviceName, row.platform, row.legacy ? "ja" : "nein", row.importedBy, row.cancelledBy, row.cancelledAt, row.redoOf];
}
export async function GET(request: Request) {
  // One JWT for the whole download: fetching a token per page would hit the auth rate limit on large exports.
  const token = await getToken();
  if (!token) return new Response(null, { status: 401 });
  const actor = await fetchQuery(api.auth.currentUser, {}, { token });
  if (!actor) return new Response(null, { status: 401 });
  if (actor.role !== "admin") return new Response(null, { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from") || "2000-01-01", to = params.get("to") || "2100-12-31";
  const format = params.get("format") || "csv";
  if (!validDay(from) || !validDay(to) || from > to || !["csv", "daily", "json", "corrections"].includes(format)) return Response.json({ error: "Ungültiger Zeitraum oder Dateityp." }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({ async start(controller) {
    const emit = (value: string) => controller.enqueue(encoder.encode(value));
    try {
      const kinds = format === "json" ? ["visits", "corrections"] as const : [format === "daily" ? "daily" : format === "corrections" ? "corrections" : "visits"] as const;
      if (format === "json") emit(`{"exportedAt":${JSON.stringify(new Date().toISOString())},"timezone":"Europe/Berlin","from":${JSON.stringify(from)},"to":${JSON.stringify(to)},"records":[`);
      else emit(csv([columns[format as keyof typeof columns]]));
      for (let index = 0; index < kinds.length; index++) {
        let cursor: string | null = null, first = true;
        if (format === "json" && index) emit('],"corrections":[');
        do {
          const page: { page: Row[]; isDone: boolean; continueCursor: string } = await fetchQuery(api.exports.page, { kind: kinds[index], from, to, paginationOpts: { cursor, numItems: 100 } }, { token });
          for (const row of page.page as Row[]) {
            if (format === "json") { emit(`${first ? "" : ","}${JSON.stringify(row)}`); first = false; }
            else emit(csv([cells(format as "csv" | "daily" | "corrections", row)]).slice(1));
          }
          cursor = page.isDone ? null : page.continueCursor;
        } while (cursor && !request.signal.aborted);
      }
      if (format === "json") emit("]}");
      controller.close();
    } catch (error) { controller.error(error); }
  } });
  return new Response(stream, { headers: { "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="chaxterlog-${format}-${from}-${to}.${format === "json" ? "json" : "csv"}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
