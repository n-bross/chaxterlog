import { database } from "@/lib/database";
import { sessionFor, sameOrigin } from "@/lib/access";

export const runtime = "nodejs";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const session = await sessionFor(request);
  if (!session) return json({ error: "Anmeldung erforderlich." }, 401);
  if (session.user.role !== "admin" || !sameOrigin(request)) return json({ error: "Nicht erlaubt." }, 403);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  const { action, reportId, resolved } = data;
  if (typeof reportId !== "string") return json({ error: "ID fehlt." }, 400);

  const sql = database();
  try {
    if (action === "toggleResolved") {
      await sql`UPDATE chaxter_support_reports SET resolved = ${Boolean(resolved)} WHERE id = ${reportId}`;
      return json({ ok: true });
    }
    if (action === "delete") {
      await sql`DELETE FROM chaxter_support_reports WHERE id = ${reportId}`;
      return json({ ok: true });
    }
    return json({ error: "Ungültige Aktion." }, 400);
  } catch (error) {
    console.error("Support action failed:", error);
    return json({ error: "Aktion fehlgeschlagen." }, 500);
  }
}
