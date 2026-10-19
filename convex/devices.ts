import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireActor } from "./auth";
import { isUuid } from "../lib/correction-types";
export async function touchDevice(ctx: MutationCtx, device: { id: string; name: string; platform: string }, username: string, rename = false) {
  if (!isUuid(device.id) || !device.name.trim() || device.name.length > 100 || device.platform.length > 100) throw new Error("Ungültiges Gerät.");
  const old = await ctx.db.query("devices").withIndex("uuid", (q) => q.eq("id", device.id)).unique();
  if (old) { await ctx.db.patch(old._id, { lastSeen: Date.now(), lastUser: username, ...(rename ? { name: device.name.slice(0, 40), platform: device.platform } : {}) }); return old._id; }
  return ctx.db.insert("devices", { ...device, name: device.name.slice(0, 40), lastSeen: Date.now(), lastUser: username });
}
export const rename = mutation({ args: { id: v.string(), name: v.string(), platform: v.string() }, handler: async (ctx, args) => { const actor = await requireActor(ctx); await touchDevice(ctx, args, actor.username, true); return null; } });
