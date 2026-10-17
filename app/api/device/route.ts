import { sessionFor, sameOrigin } from "@/lib/access";
import { database } from "@/lib/database";
export async function POST(request: Request) {
  const session = await sessionFor(request);
  if (!session) return new Response(null, { status: 401 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 2048) return new Response(null, { status: 413 });
  let value;
  try { value = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  if (typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 60 || typeof value.platform !== "string" || value.platform.length > 100) return new Response(null, { status: 400 });
  await database()`INSERT INTO chaxter_devices (id, name, platform, last_user) VALUES (${value.id}, ${value.name.trim()}, ${value.platform}, ${session.user.username ?? session.user.name})
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, platform=EXCLUDED.platform, last_seen=now(), last_user=EXCLUDED.last_user`;
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
