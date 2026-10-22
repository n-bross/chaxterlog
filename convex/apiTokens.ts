import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { requireActor } from "./auth";
import { touchDevice } from "./devices";
import { applyRecords } from "./visits";
import { dayKey, type AgeGroup } from "../lib/tracking";
import { isUuid } from "../lib/correction-types";

// Personal tokens let phone shortcuts and widgets count without a browser session. Each token
// acts as its owner and appears as its own device, so statistics and correction logs stay attributed.
const MAX_TOKENS = 10;
const PLATFORM = "Kurzbefehl / Widget";
const group = v.union(v.literal("u15"), v.literal("o15"));

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const list = query({ args: {}, handler: async (ctx) => {
  const actor = await requireActor(ctx);
  const tokens = await ctx.db.query("apiTokens").withIndex("user", (q) => q.eq("userId", actor.id)).take(MAX_TOKENS);
  return tokens.map((token) => ({ id: token._id, name: token.name, hint: token.hint, createdAt: token.createdAt, lastUsedAt: token.lastUsedAt ?? null }));
} });

export const create = mutation({ args: { name: v.string() }, handler: async (ctx, { name }) => {
  const actor = await requireActor(ctx);
  const label = name.trim().slice(0, 40);
  if (!label) throw new ConvexError("Bitte einen Namen für das Gerät angeben.");
  const existing = await ctx.db.query("apiTokens").withIndex("user", (q) => q.eq("userId", actor.id)).take(MAX_TOKENS);
  if (existing.length >= MAX_TOKENS) throw new ConvexError(`Höchstens ${MAX_TOKENS} Tokens pro Konto. Bitte zuerst einen alten löschen.`);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `chx_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const deviceId = crypto.randomUUID();
  await touchDevice(ctx, { id: deviceId, name: label, platform: PLATFORM }, actor.username);
  await ctx.db.insert("apiTokens", { userId: actor.id, name: label, tokenHash: await sha256(token), hint: token.slice(-4), deviceId, createdAt: Date.now() });
  // Shown exactly once; afterwards only the hash exists.
  return { token, name: label };
} });

export const revoke = mutation({ args: { id: v.id("apiTokens") }, handler: async (ctx, { id }) => {
  const actor = await requireActor(ctx);
  const token = await ctx.db.get(id);
  if (!token || token.userId !== actor.id) throw new ConvexError("Token nicht gefunden.");
  await ctx.db.delete(id);
  return null;
} });

// Blocking, resetting or removing an account also cuts off its shortcuts.
export async function revokeAllTokens(ctx: MutationCtx, userId: string) {
  for (const token of await ctx.db.query("apiTokens").withIndex("user", (q) => q.eq("userId", userId)).take(MAX_TOKENS * 2)) await ctx.db.delete(token._id);
}

async function tokenActor(ctx: QueryCtx, tokenHash: string) {
  const token = await ctx.db.query("apiTokens").withIndex("hash", (q) => q.eq("tokenHash", tokenHash)).unique();
  if (!token) return null;
  const user = await ctx.runQuery(components.betterAuth.management.user, { id: token.userId });
  if (!user || user.banned) return null;
  return { token, actor: { id: user.id as string, username: user.username } };
}

async function counts(ctx: QueryCtx, date: string) {
  const daily = await ctx.db.query("dailyCounts").withIndex("date", (q) => q.eq("date", date)).unique();
  const u15 = daily?.u15 ?? 0, o15 = daily?.o15 ?? 0;
  return { date, u15, o15, total: u15 + o15 };
}

const label = (value: AgeGroup) => value === "u15" ? "U15" : "Ü15";
export const summary = (value: { u15: number; o15: number; total: number }) => `U15: ${value.u15} · Ü15: ${value.o15} · Gesamt: ${value.total}`;

export const today = internalQuery({ args: { tokenHash: v.string(), date: v.string() }, handler: async (ctx, { tokenHash, date }) => {
  if (!await tokenActor(ctx, tokenHash)) return null;
  const result = await counts(ctx, date);
  return { ...result, text: summary(result) };
} });

export const count = internalMutation({ args: { tokenHash: v.string(), group, id: v.optional(v.string()) }, handler: async (ctx, args) => {
  const found = await tokenActor(ctx, args.tokenHash);
  if (!found) return null;
  const { token, actor } = found;
  // A client-chosen ID makes a retried request count once.
  if (args.id !== undefined && !isUuid(args.id)) throw new ConvexError("Ungültige Klick-ID.");
  const now = new Date();
  const [ack] = await applyRecords(ctx, actor, [{ id: args.id ?? crypto.randomUUID(), group: args.group, timestamp: now.toISOString(), order: now.getTime(), cancelled: false, userId: actor.id, username: actor.username, deviceId: token.deviceId, deviceName: token.name, platform: PLATFORM }]);
  await ctx.db.patch(token._id, { lastUsedAt: now.getTime() });
  const result = await counts(ctx, ack.date);
  return { ...result, group: args.group, text: `${label(args.group)} +1 → ${summary(result)}` };
} });

// Undoes the owner's own latest click of today, optionally limited to one group.
export const undo = internalMutation({ args: { tokenHash: v.string(), group: v.optional(group) }, handler: async (ctx, args) => {
  const found = await tokenActor(ctx, args.tokenHash);
  if (!found) return null;
  const { token, actor } = found;
  const now = new Date(), date = dayKey(now);
  const latest = ctx.db.query("visits").withIndex("userActive", (q) => q.eq("userId", actor.id).eq("date", date).eq("cancelled", false)).order("desc");
  const target = args.group ? await latest.filter((q) => q.eq(q.field("group"), args.group)).first() : await latest.first();
  if (target) {
    await applyRecords(ctx, actor, [{ id: target.id, group: target.group, timestamp: target.timestamp, order: target.order, cancelled: true,
      corrections: [{ id: crypto.randomUUID(), kind: "undo", timestamp: now.toISOString(), order: now.getTime(), userId: actor.id, username: actor.username, deviceId: token.deviceId, deviceName: token.name, platform: PLATFORM }] }]);
    await ctx.db.patch(token._id, { lastUsedAt: now.getTime() });
  }
  const result = await counts(ctx, date);
  const text = target ? `${label(target.group)} −1 (rückgängig) → ${summary(result)}` : `Nichts zum Rückgängigmachen. ${summary(result)}`;
  return { ...result, undone: target ? { group: target.group, timestamp: target.timestamp } : null, text };
} });
