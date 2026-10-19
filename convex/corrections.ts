import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireActor } from "./auth";
export async function correctionRecord(ctx: QueryCtx, c: Doc<"corrections">) {
  const [visit, device] = await Promise.all([ctx.db.get(c.visitId), c.deviceId ? ctx.db.get(c.deviceId) : null]);
  return { id: c.id, kind: c.kind, timestamp: c.timestamp, order: c.order, receivedAt: c.receivedAt, userId: c.userId, username: c.username, ...(device ? { deviceId: device.id, deviceName: c.deviceName, platform: device.platform } : {}), visitId: visit!.id, group: visit!.group, visitTimestamp: visit!.timestamp };
}
export const list = query({ args: { from: v.string(), to: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireActor(ctx);
  const page = await ctx.db.query("corrections").withIndex("date", (q) => q.gte("date", args.from).lte("date", args.to)).order("desc").paginate({ ...args.paginationOpts, numItems: 50 });
  return { ...page, page: await Promise.all(page.page.map((c) => correctionRecord(ctx, c))) };
} });
