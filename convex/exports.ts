import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireActor } from "./auth";
import { visitRecord } from "./visits";
import { correctionRecord } from "./corrections";
import { validDay } from "../lib/export";
export const page = query({ args: { kind: v.union(v.literal("visits"), v.literal("daily"), v.literal("corrections")), from: v.string(), to: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireActor(ctx, args.kind !== "daily");
  if (!validDay(args.from) || !validDay(args.to) || args.from > args.to) throw new ConvexError("Ungültiger Zeitraum.");
  const opts = { ...args.paginationOpts, numItems: 100 };
  if (args.kind === "visits") {
    const page = await ctx.db.query("visits").withIndex("date", (q) => q.gte("date", args.from).lte("date", args.to)).paginate(opts);
    return { ...page, page: await Promise.all(page.page.map(async (item) => ({ ...await visitRecord(ctx, item), importedBy: item.importedBy ?? null, cancelledBy: item.cancelledBy ?? null, cancelledAt: item.cancelledAt ?? null }))) };
  }
  if (args.kind === "corrections") {
    const page = await ctx.db.query("corrections").withIndex("date", (q) => q.gte("date", args.from).lte("date", args.to)).paginate(opts);
    return { ...page, page: await Promise.all(page.page.map((c) => correctionRecord(ctx, c))) };
  }
  const page = await ctx.db.query("dailyCounts").withIndex("date", (q) => q.gte("date", args.from).lte("date", args.to)).paginate(opts);
  return { ...page, page: page.page.map((d) => ({ date: d.date, u15: d.u15, o15: d.o15 })) };
} });
