import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireActor } from "./auth";
import { touchDevice } from "./devices";
import { dayKey } from "../lib/tracking";
import { isVisitRecord, type VisitRecord } from "../lib/sync-state";
import { redoId } from "../lib/corrections";
import { updateAggregate } from "../lib/aggregation";
import { validDay } from "../lib/export";

export async function visitRecord(ctx: QueryCtx, visit: Doc<"visits">) {
  const device = visit.deviceId ? await ctx.db.get(visit.deviceId) : null;
  return { id: visit.id, group: visit.group, timestamp: visit.timestamp, order: visit.order, cancelled: visit.cancelled, legacy: visit.legacy, ...(visit.redoOf ? { redoOf: visit.redoOf } : {}), ...(visit.userId ? { userId: visit.userId, username: visit.username } : {}), ...(device ? { deviceId: device.id, deviceName: visit.deviceName, platform: device.platform } : {}) };
}
export const live = query({ args: { date: v.string() }, handler: async (ctx, { date }) => {
  await requireActor(ctx);
  if (!validDay(date)) throw new ConvexError("Ungültiges Datum.");
  const [daily, u, o, undone, setup] = await Promise.all([
    ctx.db.query("dailyCounts").withIndex("date", (q) => q.eq("date", date)).unique(),
    ctx.db.query("visits").withIndex("groupActive", (q) => q.eq("date", date).eq("group", "u15").eq("cancelled", false)).order("desc").first(),
    ctx.db.query("visits").withIndex("groupActive", (q) => q.eq("date", date).eq("group", "o15").eq("cancelled", false)).order("desc").first(),
    ctx.db.query("visits").withIndex("redo", (q) => q.eq("date", date).eq("redoAvailable", true)).order("desc").first(),
    ctx.db.query("setup").withIndex("key", (q) => q.eq("key", "admin")).unique(),
  ]);
  // Only the two undo targets and one redo target; never a visit-list subscription.
  const targets = [u, o, undone].filter((item): item is Doc<"visits"> => !!item).map((item) => ({ id: item.id, group: item.group, timestamp: item.timestamp, order: item.order, cancelled: item.cancelled, userId: item.userId, username: item.username, ...(item.redoOf ? { redoOf: item.redoOf } : {}), ...(item.redoAvailable ? { corrections: [{ id: item.id, kind: "undo" as const, timestamp: new Date(item.undoOrder).toISOString(), order: item.undoOrder }] } : {}) }));
  return { date, epoch: setup?._id ?? "", u15: daily?.u15 ?? 0, o15: daily?.o15 ?? 0, revision: daily?.revision ?? 0, targets };
} });

export const upload = mutation({ args: { records: v.array(v.any()) }, handler: async (ctx, args) => {
  const actor = await requireActor(ctx);
  if (args.records.length > 100 || JSON.stringify(args).length > 120_000 || !args.records.every(isVisitRecord)) throw new ConvexError("Ungültiger Klickstapel.");
  return applyRecords(ctx, actor, args.records);
} });

// Shared by the app's upload and the shortcut API, so totals, hours and corrections stay consistent.
export async function applyRecords(ctx: MutationCtx, actor: { id: string; username: string }, records: VisitRecord[]) {
  const ack: { id: string; cancelled: boolean; date: string; revision: number }[] = [];
  for (const event of records) {
    if ((event.corrections ?? []).some((c) => c.userId && c.userId !== actor.id)) throw new ConvexError("Offene Korrekturen gehören zu einem anderen Benutzer. Bitte mit diesem Konto anmelden.");
    let old = await ctx.db.query("visits").withIndex("uuid", (q) => q.eq("id", event.id)).unique();
    if (!old && !event.legacy && event.userId && event.userId !== actor.id) throw new ConvexError("Offene Klicks gehören zu einem anderen Benutzer. Bitte mit diesem Konto anmelden.");
    const isNew = !old;
    let newAction = false;
    const date = old?.date ?? dayKey(new Date(event.timestamp));
    if (!validDay(date) || date < "2000-01-01" || date > "2100-12-31") throw new ConvexError("Ungültiger Besuchszeitpunkt.");
    if (!old && event.redoOf) {
      const original = await ctx.db.query("visits").withIndex("uuid", (q) => q.eq("id", event.redoOf!)).unique();
      if (!original?.cancelled || event.id !== redoId(original.id) || original.timestamp !== event.timestamp || original.group !== event.group) throw new ConvexError("Redo benötigt den stornierten Ursprung.");
      await ctx.db.patch(original._id, { redoAvailable: false });
    }
    const deviceId = event.deviceId ? await touchDevice(ctx, { id: event.deviceId, name: event.deviceName ?? "Unbenannt", platform: event.platform ?? "Unbekannt" }, actor.username) : undefined;
    const cancelled = old?.cancelled === true || event.cancelled;
    const undos = (event.corrections ?? []).filter((c) => c.kind === "undo");
    const undoOrder = Math.max(old?.undoOrder ?? 0, ...undos.map((c) => c.order ?? Date.parse(c.timestamp)), cancelled && !undos.length ? Date.now() : 0);
    const child = cancelled ? await ctx.db.query("visits").withIndex("uuid", (q) => q.eq("id", redoId(event.id))).unique() : null;
    const delta = old ? (!old.cancelled && cancelled ? -1 : 0) : (cancelled ? 0 : 1);
    const cancelDelta = cancelled && !old?.cancelled ? 1 : 0;
    const cancelFields = cancelled && !old?.cancelled ? { cancelledBy: actor.username, cancelledAt: new Date().toISOString() } : {};
    if (!old) {
      const id = await ctx.db.insert("visits", { id: event.id, date, timestamp: event.timestamp, group: event.group, order: event.order ?? Date.parse(event.timestamp), cancelled, redoAvailable: cancelled && !child, undoOrder, legacy: event.legacy === true, ...(event.redoOf ? { redoOf: event.redoOf } : {}), ...(deviceId ? { deviceId, deviceName: (event.deviceName ?? "Unbenannt").slice(0, 40) } : {}), ...(!event.legacy ? { userId: actor.id, username: actor.username } : { importedBy: actor.id }), ...cancelFields });
      old = (await ctx.db.get(id))!;
    } else if (!old.cancelled && cancelled) await ctx.db.patch(old._id, { cancelled, redoAvailable: !child, undoOrder, ...cancelFields });
    for (const action of event.corrections ?? []) {
      const exists = await ctx.db.query("corrections").withIndex("uuid", (q) => q.eq("id", action.id)).unique();
      if (exists) continue;
      if ((action.kind === "redo" && !old.redoOf) || (action.kind === "undo" && !cancelled)) throw new ConvexError("Ungültige Korrektur.");
      const actionDevice = action.deviceId ? await touchDevice(ctx, { id: action.deviceId, name: action.deviceName ?? "Unbenannt", platform: action.platform ?? "Unbekannt" }, actor.username) : undefined;
      newAction = true;
      await ctx.db.insert("corrections", { id: action.id, visitId: old._id, date: dayKey(new Date(action.timestamp)), kind: action.kind, timestamp: action.timestamp, order: action.order ?? Date.parse(action.timestamp), receivedAt: new Date().toISOString(), userId: actor.id, username: actor.username, ...(actionDevice ? { deviceId: actionDevice, deviceName: (action.deviceName ?? "Unbenannt").slice(0, 40) } : {}) });
    }
    let daily = await ctx.db.query("dailyCounts").withIndex("date", (q) => q.eq("date", date)).unique();
    const changed = isNew || cancelDelta > 0 || newAction;
    const revision = (daily?.revision ?? 0) + (changed ? 1 : 0);
    if (!daily) {
      const id = await ctx.db.insert("dailyCounts", { date, u15: 0, o15: 0, cancelled: 0, revision: 0 });
      daily = (await ctx.db.get(id))!;
    }
    if (changed) await ctx.db.patch(daily._id, { [old.group]: daily[old.group] + delta, cancelled: daily.cancelled + cancelDelta, revision, updatedAt: Date.now() });
    if (delta) {
      const hours = await ctx.db.query("dailyHours").withIndex("date", (q) => q.eq("date", date)).unique();
      const next = updateAggregate(hours ? { date, u15: daily.u15, o15: daily.o15, u: hours.u, o: hours.o } : null, old.timestamp, old.group, delta);
      if (hours) await ctx.db.patch(hours._id, { u: next.u, o: next.o });
      else await ctx.db.insert("dailyHours", { date, u: next.u, o: next.o });
    }
    ack.push({ id: event.id, cancelled, date, revision });
  }
  return ack;
}
export const list = query({ args: { from: v.string(), to: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, { from, to, paginationOpts }) => {
  await requireActor(ctx);
  const page = await ctx.db.query("visits").withIndex("date", (q) => q.gte("date", from).lte("date", to)).order("desc").paginate({ ...paginationOpts, numItems: Math.min(50, paginationOpts.numItems) });
  return { ...page, page: await Promise.all(page.page.map((item) => visitRecord(ctx, item))) };
} });
