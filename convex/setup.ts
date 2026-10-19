import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { createAuth } from "./auth";
const hash = async (token: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map((n) => n.toString(16).padStart(2, "0")).join("");
export const prepare = internalMutation({ args: { tokenHash: v.string() }, handler: async (ctx, { tokenHash }) => {
  const old = await ctx.db.query("setup").withIndex("key", (q) => q.eq("key", "admin")).unique();
  if (old?.completed || await ctx.runQuery(components.betterAuth.management.hasAdmin, {})) throw new Error("Admin bereits eingerichtet.");
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error("Ungültiger Hash.");
  const fields = { key: "admin" as const, tokenHash, expiresAt: Date.now() + 7 * 86400000, completed: false };
  if (old) await ctx.db.replace(old._id, fields); else await ctx.db.insert("setup", fields);
  return null;
} });
export const complete = mutation({ args: { token: v.string(), password: v.string() }, handler: async (ctx, { token, password }) => {
  if (!/^[a-f0-9]{64}$/.test(token) || password.length < 10 || password.length > 128) throw new Error("Gültiger Einrichtungslink und Passwort mit 10–128 Zeichen erforderlich.");
  const setup = await ctx.db.query("setup").withIndex("key", (q) => q.eq("key", "admin")).unique();
  if (!setup || setup.completed || setup.expiresAt < Date.now() || setup.tokenHash !== await hash(token)) throw new Error("Einrichtungslink ungültig, abgelaufen oder bereits verwendet.");
  if (await ctx.runQuery(components.betterAuth.management.hasAdmin, {})) throw new Error("Admin bereits eingerichtet.");
  await createAuth(ctx).api.createUser({ body: { email: `${crypto.randomUUID()}@chaxter.invalid`, name: "admin", password, role: "admin", data: { username: "admin", displayUsername: "admin" } } });
  await ctx.db.patch(setup._id, { completed: true, tokenHash: "" });
  return null;
} });
