import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { requireActor, authComponent, createAuth } from "./auth";
export const change = mutation({ args: { action: v.string(), username: v.optional(v.string()), password: v.optional(v.string()), userId: v.optional(v.string()) }, handler: async (ctx, args) => {
  const actor = await requireActor(ctx, true);
  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  if (args.action === "create") {
    const username = args.username?.trim().toLowerCase() ?? "";
    if (!/^[a-z0-9_.-]{3,30}$/.test(username) || !args.password || args.password.length < 10 || args.password.length > 128) throw new Error("Benutzername oder Passwort ungültig.");
    await auth.api.createUser({ headers, body: { email: `${crypto.randomUUID()}@chaxter.invalid`, name: username, password: args.password, role: "user", data: { username, displayUsername: username } } });
  } else {
    const target = args.userId ? await ctx.runQuery(components.betterAuth.management.user, { id: args.userId }) : null;
    if (!target || target.id === actor.id || target.role === "admin") throw new Error("Dieser Zugang kann hier nicht geändert werden.");
    const userId = target.id as string;
    if (args.action === "ban") await auth.api.banUser({ headers, body: { userId, banReason: "Vom Admin gesperrt" } });
    else if (args.action === "unban") await auth.api.unbanUser({ headers, body: { userId } });
    else if (args.action === "password") {
      if (!args.password || args.password.length < 10 || args.password.length > 128) throw new Error("Passwort: 10–128 Zeichen.");
      await auth.api.setUserPassword({ headers, body: { userId, newPassword: args.password } });
      await auth.api.revokeUserSessions({ headers, body: { userId } });
    } else throw new Error("Ungültige Aktion.");
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
