import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { requireActor } from "./auth";
import { validDay } from "../lib/export";
export const list = query({ args: { from: v.optional(v.string()), to: v.optional(v.string()), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireActor(ctx);
  const page = await ctx.db.query("events").withIndex("date", (q) => q.gte("date", args.from ?? "2000-01-01").lte("date", args.to ?? "2100-12-31")).paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 100) });
  return { ...page, page: page.page.map(({ _id, _creationTime, ...e }) => e) };
} });
export const save = mutation({ args: { events: v.array(v.object({ id: v.optional(v.string()), date: v.string(), title: v.string(), description: v.optional(v.string()) })) }, handler: async (ctx, { events }) => {
  const actor = await requireActor(ctx);
  if (!events.length || events.length > 100) throw new ConvexError("Maximal 100 Events pro Stapel.");
  for (const e of events) {
    if (!validDay(e.date) || !e.title.trim() || e.title.length > 200 || (e.description?.length ?? 0) > 1000) throw new ConvexError("Ungültiges Event.");
    const old = e.id ? await ctx.db.query("events").withIndex("uuid", (q) => q.eq("id", e.id!)).unique() : null;
    if (old) await ctx.db.patch(old._id, { date: e.date, title: e.title.trim(), description: e.description ?? "" });
    else await ctx.db.insert("events", { ...e, id: e.id ?? crypto.randomUUID(), title: e.title.trim(), createdAt: new Date().toISOString(), createdBy: actor.username });
  }
  return null;
} });
export const remove = mutation({ args: { id: v.string() }, handler: async (ctx, { id }) => { await requireActor(ctx); const old = await ctx.db.query("events").withIndex("uuid", (q) => q.eq("id", id)).unique(); if (old) await ctx.db.delete(old._id); return null; } });
