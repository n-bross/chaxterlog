import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, action, internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { updateAggregate } from "../lib/aggregation";
import { validDay } from "../lib/export";
import { requireActor, authComponent, createAuth } from "./auth";
import type { Doc } from "./_generated/dataModel";
import { qrIdentifier } from "./qrLogin";
import { revokeAllTokens } from "./apiTokens";
// Better Auth errors are plain errors, which production Convex hides; translate them for the admin.
async function authCall(run: () => Promise<unknown>, fallback: string) {
  try { await run(); } catch (error) {
    const code = String((error as { body?: { code?: unknown } }).body?.code ?? "");
    throw new ConvexError(/USERNAME|ALREADY_EXISTS|ALREADY_TAKEN/.test(code) ? "Dieser Benutzername ist bereits vergeben." : fallback);
  }
}
export const change = mutation({ args: { action: v.string(), username: v.optional(v.string()), password: v.optional(v.string()), userId: v.optional(v.string()) }, handler: async (ctx, args) => {
  const actor = await requireActor(ctx, true);
  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  if (args.action === "create") {
    const username = args.username?.trim().toLowerCase() ?? "";
    if (!/^[a-z0-9_.-]{3,30}$/.test(username) || !args.password || args.password.length < 10 || args.password.length > 128) throw new ConvexError("Benutzername: 3–30 Zeichen (a–z, 0–9, Punkt, Unterstrich, Bindestrich). Passwort: 10–128 Zeichen.");
    await authCall(() => auth.api.createUser({ headers, body: { email: `${crypto.randomUUID()}@chaxter.invalid`, name: username, password: args.password!, role: "user", data: { username, displayUsername: username } } }), "Zugang konnte nicht angelegt werden.");
  } else {
    const target = args.userId ? await ctx.runQuery(components.betterAuth.management.user, { id: args.userId }) : null;
    if (!target || target.id === actor.id || target.role === "admin") throw new ConvexError("Dieser Zugang kann hier nicht geändert werden.");
    const userId = target.id as string;
    // Blocking, a new password or removal also invalidates the person's login QR code and shortcut tokens.
    if (["ban", "password", "remove"].includes(args.action)) {
      await (await auth.$context).internalAdapter.deleteVerificationByIdentifier(qrIdentifier(userId));
      await revokeAllTokens(ctx, userId);
    }
    if (args.action === "ban") await authCall(() => auth.api.banUser({ headers, body: { userId, banReason: "Vom Admin gesperrt" } }), "Sperren fehlgeschlagen.");
    else if (args.action === "unban") await authCall(() => auth.api.unbanUser({ headers, body: { userId } }), "Freigeben fehlgeschlagen.");
    else if (args.action === "remove") {
      // Only a blocked account can be deleted, so removal is always a deliberate second step.
      if (!target.banned) throw new ConvexError("Bitte den Zugang zuerst sperren.");
      await authCall(() => auth.api.removeUser({ headers, body: { userId } }), "Zugang konnte nicht gelöscht werden.");
    }
    else if (args.action === "password") {
      if (!args.password || args.password.length < 10 || args.password.length > 128) throw new ConvexError("Passwort: 10–128 Zeichen.");
      const newPassword = args.password;
      await authCall(() => auth.api.setUserPassword({ headers, body: { userId, newPassword } }), "Passwort konnte nicht gesetzt werden.");
      await authCall(() => auth.api.revokeUserSessions({ headers, body: { userId } }), "Anmeldungen konnten nicht beendet werden.");
    } else throw new ConvexError("Ungültige Aktion.");
  }
  return null;
} });
export const users = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireActor(ctx, true);
  return ctx.runQuery(components.betterAuth.management.users, { paginationOpts: { ...args.paginationOpts, numItems: 50 } });
} });
export const devices = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireActor(ctx, true);
  const page = await ctx.db.query("devices").withIndex("seen").order("desc").paginate({ ...args.paginationOpts, numItems: 50 });
  return { ...page, page: page.page.map((d) => ({ id: d.id, name: d.name, platform: d.platform, last_seen: new Date(d.lastSeen).toISOString(), last_user: d.lastUser })) };
} });
export const reports = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireActor(ctx, true);
  const page = await ctx.db.query("support").withIndex("created").order("desc").paginate({ ...args.paginationOpts, numItems: 50 });
  return { ...page, page: page.page.map((r) => ({ ...JSON.parse(r.payload), id: r._id, created_at: new Date(r.createdAt).toISOString(), user_id: r.userId, username: r.username, resolved: r.resolved })) };
} });

// Deletes the visits a staff member counted in a date range, after the admin re-enters their password.
// Runs as an action so the password check (scrypt) does not count against a mutation's limits; the
// visits are removed in batches that each keep the daily totals consistent.
export const deleteEntries = action({ args: { userId: v.string(), from: v.string(), to: v.string(), password: v.string() }, handler: async (ctx, args): Promise<{ deleted: number }> => {
  await requireActor(ctx, true);
  if (!validDay(args.from) || !validDay(args.to) || args.from > args.to) throw new ConvexError("Ungültiger Zeitraum.");
  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  try { await auth.api.verifyPassword({ headers, body: { password: args.password } }); }
  catch { throw new ConvexError("Das Passwort stimmt nicht. Es wurde nichts gelöscht."); }
  let deleted = 0;
  for (;;) {
    const batch: { deleted: number; done: boolean } = await ctx.runMutation(internal.admin.deleteEntriesBatch, { userId: args.userId, from: args.from, to: args.to });
    deleted += batch.deleted;
    if (batch.done) return { deleted };
  }
} });

export const deleteEntriesBatch = internalMutation({ args: { userId: v.string(), from: v.string(), to: v.string() }, handler: async (ctx, args) => {
  const visits = await ctx.db.query("visits").withIndex("userDate", (q) => q.eq("userId", args.userId).gte("date", args.from).lte("date", args.to)).take(200);
  const days = new Map<string, { daily: Doc<"dailyCounts"> | null; hours: Doc<"dailyHours"> | null; u15: number; o15: number; cancelled: number; u: number[]; o: number[] }>();
  for (const visit of visits) {
    let day = days.get(visit.date);
    if (!day) {
      const daily = await ctx.db.query("dailyCounts").withIndex("date", (q) => q.eq("date", visit.date)).unique();
      const hours = await ctx.db.query("dailyHours").withIndex("date", (q) => q.eq("date", visit.date)).unique();
      day = { daily, hours, u15: daily?.u15 ?? 0, o15: daily?.o15 ?? 0, cancelled: daily?.cancelled ?? 0, u: hours?.u ?? Array(24).fill(0), o: hours?.o ?? Array(24).fill(0) };
      days.set(visit.date, day);
    }
    if (visit.cancelled) day.cancelled = Math.max(0, day.cancelled - 1);
    else {
      const next = updateAggregate({ date: visit.date, u15: day.u15, o15: day.o15, u: day.u, o: day.o }, visit.timestamp, visit.group, -1);
      Object.assign(day, { u15: next.u15, o15: next.o15, u: next.u, o: next.o });
    }
    for (const correction of await ctx.db.query("corrections").withIndex("visit", (q) => q.eq("visitId", visit._id)).collect()) await ctx.db.delete(correction._id);
    await ctx.db.delete(visit._id);
  }
  // A new revision makes every open counter replace its local copy of these days.
  for (const day of days.values()) {
    if (day.daily) await ctx.db.patch(day.daily._id, { u15: day.u15, o15: day.o15, cancelled: day.cancelled, revision: day.daily.revision + 1, updatedAt: Date.now() });
    if (day.hours) await ctx.db.patch(day.hours._id, { u: day.u, o: day.o });
  }
  return { deleted: visits.length, done: visits.length < 200 };
} });
