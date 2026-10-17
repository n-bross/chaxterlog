import { NextResponse } from "next/server";
import { isTrackEvent } from "@/lib/tracking";
import { isVisitRecord, type VisitRecord } from "@/lib/sync-state";
import { database, listVisits, saveVisits } from "@/lib/database";

import { redoId } from "@/lib/corrections";
import { sessionFor, sameOrigin } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });

export async function GET(request: Request) {
  const session = await sessionFor(request);
  if (!session) return reply({ error: "Anmeldung erforderlich." }, 401);
  try { return reply({ records: await listVisits() }); }
  catch { return reply({ error: "Gemeinsamer Speicher momentan nicht erreichbar." }, 503); }
}
export async function POST(request: Request) { return write(request, false); }
export async function DELETE(request: Request) { return write(request, true); }

async function write(request: Request, undo: boolean) {
  const session = await sessionFor(request);
  if (!session) return reply({ error: "Anmeldung erforderlich." }, 401);
  if (!sameOrigin(request)) return reply({ error: "Fremder Ursprung." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "JSON erforderlich." }, 415);
  let value: unknown;
  try {
    const body = await request.text();
    if (body.length > 200_000) return reply({ error: "Anfrage zu groß." }, 413);
    value = JSON.parse(body);
  } catch { return reply({ error: "Ungültiges JSON." }, 400); }
  // Accept the original single-event API as well as queued migration/retry batches.
  const batch = value && typeof value === "object" && "records" in value ? (value as { records: unknown }).records : null;
  let records: VisitRecord[];
  if (Array.isArray(batch) && !undo) {
    if (batch.length < 1 || batch.length > 200 || !batch.every(isVisitRecord)) return reply({ error: "Ungültiger Stapel." }, 400);
    records = batch;
  } else if (isTrackEvent(value)) records = [{ ...value, cancelled: undo }];
  else return reply({ error: "Ungültiger Besuch." }, 400);
  if (new Set(records.map((event) => event.id)).size !== records.length) return reply({ error: "Doppelte IDs im Stapel." }, 400);
  // PostgreSQL timestamp limits; a wildly incorrect device clock needs correction first.
  if (records.some((event) => Date.parse(event.timestamp) < Date.UTC(2000, 0, 1) || Date.parse(event.timestamp) > Date.now() + 86_400_000)) return reply({ error: "Datum außerhalb des zulässigen Bereichs." }, 400);
  if (records.some((event) => !event.cancelled && event.userId && event.userId !== session.user.id)) return reply({ error: "Offene Klicks gehören zu einem anderen Benutzer. Bitte mit diesem Zugang anmelden." }, 409);
  const actions = records.flatMap((event) => (event.corrections ?? []).map((action) => ({ ...action, visitId: event.id })));
  if (new Set(actions.map((action) => action.id)).size !== actions.length || records.some((event) => event.redoOf && (event.id !== redoId(event.redoOf) || !event.corrections?.some((action) => action.kind === "redo")) || event.corrections?.some((action) => action.kind === "undo" && !event.cancelled || action.kind === "redo" && !event.redoOf))) return reply({ error: "Ungültige Korrekturverknüpfung." }, 400);
  if (actions.some((action) => Date.parse(action.timestamp) < Date.UTC(2000, 0, 1) || Date.parse(action.timestamp) > Date.now() + 86_400_000)) return reply({ error: "Ungültiger Korrekturzeitpunkt." }, 400);
  try {
    const known = actions.length ? await database()`SELECT id,visit_id FROM chaxter_corrections WHERE id=ANY(${actions.map((action) => action.id)}::uuid[])` : [];
    const knownIds = new Map(known.map((action) => [action.id, action.visit_id]));
    if (actions.some((action) => knownIds.has(action.id) ? knownIds.get(action.id) !== action.visitId : action.userId && action.userId !== session.user.id)) return reply({ error: "Offene Korrekturen gehören zu einem anderen Benutzer. Bitte mit diesem Zugang anmelden." }, 409);
    const parents = records.filter((event) => event.redoOf).map((event) => event.redoOf!);
    if (parents.length) {
      const existing = await database()`SELECT id FROM chaxter_visits WHERE id=ANY(${parents}::uuid[]) AND cancelled`;
      const cancelled = new Set([...existing.map((row) => row.id), ...records.filter((event) => event.cancelled).map((event) => event.id)]);
      if (parents.some((id) => !cancelled.has(id))) return reply({ error: "Der zugehörige Undo wird zuerst synchronisiert. Bitte kurz warten." }, 409);
    }
  } catch { return reply({ error: "Korrekturprüfung momentan nicht erreichbar." }, 503); }
  try { return reply({ persisted: true, records: await saveVisits(records, { id: session.user.id, username: session.user.username ?? session.user.name }) }); }
  catch { return reply({ error: "Nicht synchronisiert; lokal gespeicherte Klicks werden erneut gesendet." }, 503); }
}
