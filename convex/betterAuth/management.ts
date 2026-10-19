import { paginator } from "convex-helpers/server/pagination";
import schema from "./schema";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
const safeUser = v.object({ id: v.string(), username: v.string(), role: v.string(), banned: v.boolean() });
// Component functions are private to the parent app; none are HTTP-callable.
export const hasAdmin = query({ args: {}, returns: v.boolean(), handler: async (ctx) => !!await ctx.db.query("user").withIndex("role", (q) => q.eq("role", "admin")).first() });
export const user = query({ args: { id: v.string() }, returns: v.union(v.null(), safeUser), handler: async (ctx, { id }) => {
  const key = ctx.db.normalizeId("user", id);
  const user = key ? await ctx.db.get(key) : null;
  return user ? { id: user._id, username: user.username ?? user.name, role: user.role ?? "user", banned: user.banned ?? false } : null;
} });
export const users = query({ args: { paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(safeUser), isDone: v.boolean(), continueCursor: v.string() }), handler: async (ctx, { paginationOpts }) => {
  const page = await paginator(ctx.db, schema).query("user").withIndex("by_creation_time").paginate({ ...paginationOpts, numItems: Math.min(50, paginationOpts.numItems) });
  return { isDone: page.isDone, continueCursor: page.continueCursor, page: page.page.map((user) => ({ id: user._id, username: user.username ?? user.name, role: user.role ?? "user", banned: user.banned ?? false })) };
} });
