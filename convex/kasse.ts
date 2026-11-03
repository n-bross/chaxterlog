import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireActor } from "./auth";
import { DEFAULT_BUTTONS, validateButtons, validateOp, type KasseButton, type KasseOp, type OpAck, type ServerEntry, type ServerSession } from "../lib/kasse";

const base = { id: v.string(), sessionId: v.string(), at: v.string(), seq: v.number(), deviceId: v.string(), deviceName: v.string() };
const opValidator = v.union(
  v.object({ ...base, type: v.literal("open"), floatCents: v.number() }),
  v.object({ ...base, type: v.literal("sale"), amountCents: v.number() }),
  v.object({ ...base, type: v.literal("storno"), saleId: v.string() }),
  v.object({ ...base, type: v.literal("close"), countedCents: v.number() }),
);
// More than one evening's bookings would never be shown at once; the limit only bounds the read.
const ENTRY_LIMIT = 5000;

const findSession = (ctx: QueryCtx, id: string) => ctx.db.query("kasseSessions").withIndex("by_uuid", (q) => q.eq("id", id)).unique();
const findEntry = (ctx: QueryCtx, id: string) => ctx.db.query("kasseEntries").withIndex("by_uuid", (q) => q.eq("id", id)).unique();

/**
 * Applies a device's operations in its order. Each operation ID is stored once, so a retry,
 * a lost acknowledgement or a double tap can never book twice. Money is never rejected for being
 * late: a booking that reaches an already closed session is kept and marked "late".
 */
export const sync = mutation({ args: { ops: v.array(opValidator) }, handler: async (ctx, { ops }): Promise<OpAck[]> => {
  const actor = await requireActor(ctx);
  if (ops.length > 100) throw new ConvexError("Zu viele Buchungen auf einmal.");
  const acks: OpAck[] = [];
  for (const op of ops) {
    const problem = validateOp(op);
    if (problem) throw new ConvexError(problem);
    acks.push({ id: op.id, status: await apply(ctx, actor, op) });
  }
  return acks;
} });

async function apply(ctx: MutationCtx, actor: { id: string; username: string }, op: KasseOp): Promise<OpAck["status"]> {
  const deviceName = op.deviceName.slice(0, 60);
  if (op.type === "open") {
    if (await findSession(ctx, op.sessionId)) return "duplicate";
    await ctx.db.insert("kasseSessions", { id: op.sessionId, status: "open", openedAt: op.at, openedBy: actor.username, openedById: actor.id, deviceName, floatCents: op.floatCents, salesCents: 0, saleCount: 0, stornoCents: 0, stornoCount: 0, lateCount: 0 });
    return "ok";
  }
  const session = await findSession(ctx, op.sessionId);
  // The device always sends "open" first, so this means a broken client; the error stops its queue visibly.
  if (!session) throw new ConvexError("Kasse unbekannt – die Eröffnung fehlt.");
  if (op.type === "close") {
    if (session.status === "closed") return session.closeOpId === op.id ? "duplicate" : "ignored";
    await ctx.db.patch(session._id, { status: "closed", closedAt: op.at, closedBy: actor.username, countedCents: op.countedCents, expectedCents: expected(session), closeOpId: op.id });
    return "ok";
  }
  if (await findEntry(ctx, op.id)) return "duplicate";
  const late = session.status === "closed";
  const common = { id: op.id, sessionId: op.sessionId, at: op.at, seq: op.seq, receivedAt: Date.now(), userId: actor.id, username: actor.username, deviceId: op.deviceId, deviceName, late };
  if (op.type === "sale") {
    await ctx.db.insert("kasseEntries", { ...common, kind: "sale", amountCents: op.amountCents, ignored: false });
    await ctx.db.patch(session._id, { salesCents: session.salesCents + op.amountCents, saleCount: session.saleCount + 1, lateCount: session.lateCount + (late ? 1 : 0) });
    return late ? "late" : "ok";
  }
  const sale = await findEntry(ctx, op.saleId);
  if (!sale || sale.kind !== "sale" || sale.sessionId !== op.sessionId) throw new ConvexError("Stornierte Buchung unbekannt.");
  // A second storno of the same sale (another device, a repeated tap) is logged but changes nothing.
  const earlier = await ctx.db.query("kasseEntries").withIndex("by_saleId", (q) => q.eq("saleId", op.saleId)).take(1);
  const ignored = earlier.length > 0;
  await ctx.db.insert("kasseEntries", { ...common, kind: "storno", amountCents: -sale.amountCents, saleId: op.saleId, ignored });
  if (ignored) return "ignored";
  await ctx.db.patch(session._id, { stornoCents: session.stornoCents + sale.amountCents, stornoCount: session.stornoCount + 1, lateCount: session.lateCount + (late ? 1 : 0) });
  return late ? "late" : "ok";
}

const expected = (s: Doc<"kasseSessions">) => s.floatCents + s.salesCents - s.stornoCents;
// Convex has no undefined; optional fields are left out instead.
const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
function toSession(s: Doc<"kasseSessions">): ServerSession {
  return defined({ id: s.id, status: s.status, openedAt: s.openedAt, openedBy: s.openedBy, floatCents: s.floatCents, salesCents: s.salesCents, saleCount: s.saleCount, stornoCents: s.stornoCents, stornoCount: s.stornoCount, lateCount: s.lateCount, closedAt: s.closedAt, closedBy: s.closedBy, countedCents: s.countedCents, expectedCents: s.expectedCents });
}

/** Open sessions plus the latest closings with their difference. */
export const overview = query({ args: {}, handler: async (ctx) => {
  await requireActor(ctx);
  const open = await ctx.db.query("kasseSessions").withIndex("by_status_and_openedAt", (q) => q.eq("status", "open")).order("desc").take(10);
  const closed = await ctx.db.query("kasseSessions").withIndex("by_status_and_openedAt", (q) => q.eq("status", "closed")).order("desc").take(20);
  return { open: open.map(toSession), closed: closed.map(toSession) };
} });

export const session = query({ args: { id: v.string() }, handler: async (ctx, { id }) => {
  await requireActor(ctx);
  const doc = await findSession(ctx, id);
  if (!doc) return { session: null, entries: [] as ServerEntry[] };
  const rows = await ctx.db.query("kasseEntries").withIndex("by_sessionId_and_seq", (q) => q.eq("sessionId", id)).take(ENTRY_LIMIT);
  const entries: ServerEntry[] = rows.map((e) => defined({ id: e.id, kind: e.kind, amountCents: e.amountCents, saleId: e.saleId, at: e.at, seq: e.seq, username: e.username, deviceName: e.deviceName, late: e.late, ignored: e.ignored }));
  return { session: toSession(doc), entries };
} });

const buttonValidator = v.object({ id: v.string(), label: v.string(), priceCents: v.number(), pfand: v.boolean() });
export const buttons = query({ args: {}, handler: async (ctx): Promise<KasseButton[]> => {
  await requireActor(ctx);
  const doc = await ctx.db.query("kasseButtons").withIndex("by_key", (q) => q.eq("key", "default")).unique();
  return doc?.buttons ?? DEFAULT_BUTTONS;
} });
export const saveButtons = mutation({ args: { buttons: v.array(buttonValidator) }, handler: async (ctx, { buttons }) => {
  const actor = await requireActor(ctx, true);
  const cleaned = buttons.map((b) => ({ ...b, label: b.label.trim() }));
  const problem = validateButtons(cleaned);
  if (problem) throw new ConvexError(problem);
  const doc = await ctx.db.query("kasseButtons").withIndex("by_key", (q) => q.eq("key", "default")).unique();
  const value = { key: "default" as const, buttons: cleaned, updatedAt: Date.now(), updatedBy: actor.username };
  if (doc) await ctx.db.replace("kasseButtons", doc._id, value);
  else await ctx.db.insert("kasseButtons", value);
  return null;
} });
