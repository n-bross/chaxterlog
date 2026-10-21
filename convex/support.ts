import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireActor } from "./auth";
export const send = mutation({ args: { payload: v.string() }, handler: async (ctx, { payload }) => {
  const actor = await requireActor(ctx);
  if (payload.length > 20_000) throw new ConvexError("Diagnosedaten zu groß.");
  const data = JSON.parse(payload);
  const id = await ctx.db.insert("support", { createdAt: Date.now(), userId: actor.id, username: actor.username, payload: JSON.stringify({ notes: String(data.notes ?? "").slice(0, 2000), device_id: data.deviceId ?? null, device_name: data.deviceName ?? null, platform: data.platform ?? null, user_agent: String(data.userAgent ?? "").slice(0, 500), app_version: String(data.appVersion ?? "").slice(0, 50), is_online: !!data.isOnline, unsynced_count: data.unsyncedCount, today_counts: data.todayCounts, queue_sample: data.queueSample?.slice(0, 20), system_info: data.systemInfo }), resolved: false });
  return { ok: true, id };
} });
export const change = mutation({ args: { reportId: v.id("support"), action: v.union(v.literal("delete"), v.literal("toggleResolved")), resolved: v.boolean() }, handler: async (ctx, args) => { await requireActor(ctx, true); if (args.action === "delete") await ctx.db.delete(args.reportId); else await ctx.db.patch(args.reportId, { resolved: args.resolved }); return null; } });
