import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { requireActor, authComponent, createAuth } from "./auth";
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
    if (args.action === "ban") await authCall(() => auth.api.banUser({ headers, body: { userId, banReason: "Vom Admin gesperrt" } }), "Sperren fehlgeschlagen.");
    else if (args.action === "unban") await authCall(() => auth.api.unbanUser({ headers, body: { userId } }), "Freigeben fehlgeschlagen.");
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
