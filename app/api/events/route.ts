import { NextResponse } from "next/server";
import { sessionFor, sameOrigin } from "@/lib/access";
import { listEvents, saveEvents, updateEvent, deleteEvent } from "@/lib/database";
import { normalizeDate, type ChaxterEventInput } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });

export async function GET(request: Request) {
  const session = await sessionFor(request);
  if (!session) return reply({ error: "Anmeldung erforderlich." }, 401);

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  try {
    const events = await listEvents(from, to);
    return reply({ events });
  } catch (err) {
    console.error("Failed to list events:", err);
    return reply({ error: "Fehler beim Laden der Events." }, 500);
  }
}

export async function POST(request: Request) {
  const session = await sessionFor(request);
  if (!session) return reply({ error: "Anmeldung erforderlich." }, 401);
  if (!sameOrigin(request)) return reply({ error: "Fremder Ursprung." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Ungültiges JSON." }, 400);
  }

  // Support single item or batch array: { events: [...] } or { date, title, description } or [...]
  let rawList: unknown[] = [];
  if (Array.isArray(body)) {
    rawList = body;
  } else if (body && typeof body === "object" && "events" in body && Array.isArray((body as { events: unknown }).events)) {
    rawList = (body as { events: unknown[] }).events;
  } else if (body && typeof body === "object" && "title" in body && "date" in body) {
    rawList = [body];
  } else {
    return reply({ error: "Ungültiges Format für Events." }, 400);
  }

  if (rawList.length === 0) {
    return reply({ error: "Keine Events übergeben." }, 400);
  }
  if (rawList.length > 500) {
    return reply({ error: "Maximal 500 Events pro Import erlaubt." }, 413);
  }

  const validated: ChaxterEventInput[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const rawDate = typeof rec.date === "string" ? rec.date : "";
    const rawTitle = typeof rec.title === "string" ? rec.title.trim() : "";
    const rawDesc = typeof rec.description === "string" ? rec.description.trim() : undefined;
    const rawId = typeof rec.id === "string" && /^[0-9a-f-]{36}$/i.test(rec.id) ? rec.id : undefined;

    const date = normalizeDate(rawDate);
    if (!date || !rawTitle) continue;

    validated.push({
      id: rawId,
      date,
      title: rawTitle.slice(0, 200),
      description: rawDesc ? rawDesc.slice(0, 1000) : undefined,
    });
  }

  if (validated.length === 0) {
    return reply({ error: "Keine gültigen Events gefunden. Bitte Datum und Titel prüfen." }, 400);
  }

  try {
    const actor = { id: session.user.id, username: session.user.name || session.user.email || "Mitarbeiter" };
    const saved = await saveEvents(validated, actor);
    return reply({ success: true, count: validated.length, events: saved });
  } catch (err) {
    console.error("Failed to save events:", err);
    return reply({ error: "Fehler beim Speichern der Events." }, 500);
  }
}

export async function PATCH(request: Request) {
  const session = await sessionFor(request);
  if (!session) return reply({ error: "Anmeldung erforderlich." }, 401);
  if (!sameOrigin(request)) return reply({ error: "Fremder Ursprung." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Ungültiges JSON." }, 400);
  }

  if (!body || typeof body !== "object") {
    return reply({ error: "Ungültige Daten." }, 400);
  }

  const rec = body as Record<string, unknown>;
  const rawId = typeof rec.id === "string" && /^[0-9a-f-]{36}$/i.test(rec.id) ? rec.id : undefined;
  const rawTitle = typeof rec.title === "string" ? rec.title.trim() : "";
  const rawDate = typeof rec.date === "string" ? normalizeDate(rec.date) : undefined;
  const rawDesc = typeof rec.description === "string" ? rec.description.trim() : undefined;

  if (!rawId) {
    return reply({ error: "Ungültige Event-ID." }, 400);
  }
  if (!rawTitle) {
    return reply({ error: "Titel darf nicht leer sein." }, 400);
  }

  try {
    const actor = { id: session.user.id, username: session.user.name || session.user.email || "Mitarbeiter" };
    if (rawDate) {
      const saved = await saveEvents(
        [
          {
            id: rawId,
            date: rawDate,
            title: rawTitle.slice(0, 200),
            description: rawDesc ? rawDesc.slice(0, 1000) : undefined,
          },
        ],
        actor
      );
      return reply({ success: true, events: saved });
    } else {
      await updateEvent(rawId, {
        title: rawTitle.slice(0, 200),
        description: rawDesc !== undefined ? rawDesc.slice(0, 1000) : null,
      });
      const events = await listEvents();
      return reply({ success: true, events });
    }
  } catch (err) {
    console.error("Failed to update event:", err);
    return reply({ error: "Fehler beim Aktualisieren des Events." }, 500);
  }
}

export const PUT = PATCH;

export async function DELETE(request: Request) {
  const session = await sessionFor(request);
  if (!session) return reply({ error: "Anmeldung erforderlich." }, 401);
  if (!sameOrigin(request)) return reply({ error: "Fremder Ursprung." }, 403);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return reply({ error: "Ungültige Event-ID." }, 400);
  }

  try {
    const success = await deleteEvent(id);
    return reply({ success });
  } catch (err) {
    console.error("Failed to delete event:", err);
    return reply({ error: "Fehler beim Löschen des Events." }, 500);
  }
}
