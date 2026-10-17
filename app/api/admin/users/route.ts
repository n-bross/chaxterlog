import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { sessionFor, sameOrigin } from "@/lib/access";
import { adminOverview } from "@/lib/admin-data";
import { database } from "@/lib/database";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const session = await sessionFor(request);
  if (!session) return json({ error: "Anmeldung erforderlich." }, 401);
  if (session.user.role !== "admin") return json({ error: "Admin erforderlich." }, 403);
  return json(await adminOverview());
}
export async function POST(request: Request) {
  const session = await sessionFor(request);
  if (!session) return json({ error: "Anmeldung erforderlich." }, 401);
  if (session.user.role !== "admin" || !sameOrigin(request)) return json({ error: "Nicht erlaubt." }, 403);
  const text = await request.text();
  if (text.length > 4096) return json({ error: "Anfrage zu groß." }, 413);
  let data;
  try { data = JSON.parse(text); } catch { return json({ error: "Ungültige Anfrage." }, 400); }
  try {
    if (data.action === "create") {
      const username = typeof data.username === "string" ? data.username.trim().toLowerCase() : "";
      if (!/^[a-z0-9_.-]{3,30}$/.test(username) || typeof data.password !== "string" || data.password.length < 10 || data.password.length > 128) return json({ error: "Benutzername: 3–30 Zeichen (a–z, 0–9, Punkt, Bindestrich, Unterstrich). Passwort: mindestens 10 Zeichen." }, 400);
      const existing = await database()`SELECT id FROM "user" WHERE username=${username}`;
      if (existing.length) return json({ error: "Benutzername bereits vergeben." }, 409);
      await auth.api.createUser({ headers: request.headers, body: { email: `${randomUUID()}@chaxter.invalid`, name: username, password: data.password, role: "user", data: { username, displayUsername: username } } });
    } else if (["ban", "unban", "password"].includes(data.action) && typeof data.userId === "string") {
      if (data.userId === session.user.id) return json({ error: "Das eigene Konto hier nicht verändern. Passwort unter Konto ändern." }, 400);
      const target = await database()`SELECT role FROM "user" WHERE id=${data.userId}`;
      if (!target.length || target[0].role === "admin") return json({ error: "Dieser Zugang kann hier nicht geändert werden." }, 403);
      if (data.action === "ban") await auth.api.banUser({ headers: request.headers, body: { userId: data.userId, banReason: "Vom Admin gesperrt" } });
      if (data.action === "unban") await auth.api.unbanUser({ headers: request.headers, body: { userId: data.userId } });
      if (data.action === "password") {
        if (typeof data.password !== "string" || data.password.length < 10 || data.password.length > 128) return json({ error: "Passwort: 10–128 Zeichen." }, 400);
        await auth.api.setUserPassword({ headers: request.headers, body: { userId: data.userId, newPassword: data.password } });
        await auth.api.revokeUserSessions({ headers: request.headers, body: { userId: data.userId } });
      }
    } else return json({ error: "Ungültige Aktion." }, 400);
    return json({ ok: true });
  } catch { return json({ error: "Änderung fehlgeschlagen. Bitte Eingaben prüfen und erneut versuchen." }, 400); }
}
