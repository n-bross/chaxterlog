import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireActor } from "./auth";
export const days = query({ args: { from: v.string(), to: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireActor(ctx);
  const page = await ctx.db.query("dailyCounts").withIndex("date", (q) => q.gte("date", args.from).lte("date", args.to)).paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 100) });
  return { ...page, page: await Promise.all(page.page.map(async (day) => {
    const hours = await ctx.db.query("dailyHours").withIndex("date", (q) => q.eq("date", day.date)).unique();
    return { date: day.date, u15: day.u15, o15: day.o15, u: hours?.u ?? Array(24).fill(0), o: hours?.o ?? Array(24).fill(0) };
  })) };
} });
