import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { auth, pool } from "@/lib/auth";
import { sameOrigin } from "@/lib/access";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  const text = await request.text();
  if (text.length > 4096) return new Response(null, { status: 413 });
  let data;
  try { data = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  if (typeof data.token !== "string" || !/^[a-f0-9]{64}$/.test(data.token) || typeof data.password !== "string" || data.password.length < 10 || data.password.length > 128) return Response.json({ error: "Gültiger Einrichtungslink und mindestens 10 Zeichen Passwort erforderlich." }, { status: 400 });
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const result = await connection.query("SELECT * FROM chaxter_setup WHERE id=1 FOR UPDATE");
    const setup = result.rows[0];
    const actual = createHash("sha256").update(data.token).digest("hex");
    if (!setup || setup.completed || new Date(setup.expires_at) < new Date() || !timingSafeEqual(Buffer.from(setup.token_hash), Buffer.from(actual))) {
      await connection.query("ROLLBACK");
      return Response.json({ error: "Einrichtungslink ungültig, abgelaufen oder bereits verwendet." }, { status: 403 });
    }
    const admins = await connection.query('SELECT id FROM "user" WHERE role=\'admin\' LIMIT 1');
    if (admins.rowCount) { await connection.query("ROLLBACK"); return Response.json({ error: "Admin bereits eingerichtet." }, { status: 409 }); }
    await auth.api.createUser({ body: { email: `${randomUUID()}@chaxter.invalid`, name: "admin", password: data.password, role: "admin", data: { username: "admin", displayUsername: "admin" } } });
    await connection.query("UPDATE chaxter_setup SET completed=true WHERE id=1");
    await connection.query("COMMIT");
    return Response.json({ ok: true });
  } catch {
    await connection.query("ROLLBACK");
    return Response.json({ error: "Einrichtung nicht möglich. Bitte erneut versuchen." }, { status: 500 });
  } finally { connection.release(); }
}
