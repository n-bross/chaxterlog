import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);
// No public registration, email login, role changes or admin shortcuts.
const allowed = new Set(["get-session", "sign-in/username", "sign-out", "change-password"]);
function permitted(request: Request) {
  return allowed.has(new URL(request.url).pathname.replace(/^\/api\/auth\//, ""));
}
export async function GET(request: Request) { return permitted(request) ? handlers.GET(request) : new Response(null, { status: 404 }); }
export async function POST(request: Request) { return permitted(request) ? handlers.POST(request) : new Response(null, { status: 404 }); }
