import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { sha256 } from "./apiTokens";
import { dayKey } from "../lib/tracking";
const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

// Counting API for phone shortcuts and widgets. Every response carries a ready-to-show `text`,
// also for errors, because Apple Shortcuts and HTTP Shortcuts pass non-2xx bodies through unchanged.
// `?format=text` returns only that line, for widget tools that cannot read JSON.
function reply(request: Request, status: number, body: Record<string, unknown> & { text: string }) {
  const headers = { "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.get("format") === "text") return new Response(body.text, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  return Response.json(body, { status, headers });
}
const fail = (request: Request, status: number, text: string) => reply(request, status, { error: text, text });
const unauthorized = (request: Request) => fail(request, 401, "Token ungültig oder widerrufen. Neuen Token unter Konto → Handy-Widget & Kurzbefehle erstellen.");

// Header first; the query parameter exists for widget tools that cannot send headers.
async function tokenHash(request: Request, allowQuery: boolean) {
  const header = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = header ?? (allowQuery ? new URL(request.url).searchParams.get("token") : null);
  return token && /^chx_[0-9a-f]{64}$/.test(token) ? sha256(token) : null;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function parseGroup(value: unknown) {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  return key === "u15" ? "u15" as const : ["o15", "ü15", "ue15"].includes(key) ? "o15" as const : null;
}

http.route({ path: "/api/v1/today", method: "GET", handler: httpAction(async (ctx, request) => {
  const hash = await tokenHash(request, true);
  if (!hash) return unauthorized(request);
  const result = await ctx.runQuery(internal.apiTokens.today, { tokenHash: hash, date: dayKey() });
  return result ? reply(request, 200, result) : unauthorized(request);
}) });

http.route({ path: "/api/v1/visit", method: "POST", handler: httpAction(async (ctx, request) => {
  const hash = await tokenHash(request, false);
  if (!hash) return unauthorized(request);
  const body = await readBody(request);
  if (!body) return fail(request, 400, "Ungültiger JSON-Inhalt.");
  const group = parseGroup(body.group ?? new URL(request.url).searchParams.get("group"));
  if (!group) return fail(request, 400, "Gruppe fehlt: \"u15\" oder \"o15\" angeben.");
  if (body.id !== undefined && typeof body.id !== "string") return fail(request, 400, "Ungültige Klick-ID.");
  try {
    const result = await ctx.runMutation(internal.apiTokens.count, { tokenHash: hash, group, ...(body.id ? { id: body.id as string } : {}) });
    return result ? reply(request, 200, result) : unauthorized(request);
  } catch (error) {
    if (error instanceof ConvexError) return fail(request, 400, String(error.data));
    throw error;
  }
}) });

http.route({ path: "/api/v1/undo", method: "POST", handler: httpAction(async (ctx, request) => {
  const hash = await tokenHash(request, false);
  if (!hash) return unauthorized(request);
  const body = await readBody(request);
  if (!body) return fail(request, 400, "Ungültiger JSON-Inhalt.");
  const group = parseGroup(body.group ?? new URL(request.url).searchParams.get("group") ?? undefined);
  if (group === null) return fail(request, 400, "Gruppe muss \"u15\" oder \"o15\" sein.");
  const result = await ctx.runMutation(internal.apiTokens.undo, { tokenHash: hash, ...(group ? { group } : {}) });
  return result ? reply(request, 200, result) : unauthorized(request);
}) });

export default http;
