import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
const group = v.union(v.literal("u15"), v.literal("o15"));
export default defineSchema({
  visits: defineTable({ id: v.string(), date: v.string(), timestamp: v.string(), group, order: v.number(), cancelled: v.boolean(), redoAvailable: v.boolean(), undoOrder: v.number(), redoOf: v.optional(v.string()), deviceId: v.optional(v.id("devices")), deviceName: v.optional(v.string()), userId: v.optional(v.string()), username: v.optional(v.string()), legacy: v.boolean(), importedBy: v.optional(v.string()), cancelledBy: v.optional(v.string()), cancelledAt: v.optional(v.string()) })
    .index("uuid", ["id"]).index("date", ["date", "order"]).index("active", ["date", "cancelled", "order"]).index("groupActive", ["date", "group", "cancelled", "order"]).index("redo", ["date", "redoAvailable", "undoOrder"]).index("userDate", ["userId", "date"]).index("userActive", ["userId", "date", "cancelled", "order"]),
  dailyCounts: defineTable({ date: v.string(), u15: v.number(), o15: v.number(), cancelled: v.number(), revision: v.number(), updatedAt: v.optional(v.number()) }).index("date", ["date"]),
  dailyHours: defineTable({ date: v.string(), u: v.array(v.number()), o: v.array(v.number()) }).index("date", ["date"]),
  corrections: defineTable({ id: v.string(), visitId: v.id("visits"), date: v.string(), kind: v.union(v.literal("undo"), v.literal("redo")), timestamp: v.string(), order: v.number(), receivedAt: v.string(), userId: v.string(), username: v.string(), deviceId: v.optional(v.id("devices")), deviceName: v.optional(v.string()) }).index("uuid", ["id"]).index("date", ["date", "order"]).index("visit", ["visitId", "order"]),
  devices: defineTable({ id: v.string(), name: v.string(), platform: v.string(), lastSeen: v.number(), lastUser: v.string() }).index("uuid", ["id"]).index("seen", ["lastSeen"]),
  events: defineTable({ id: v.string(), date: v.string(), title: v.string(), description: v.optional(v.string()), createdAt: v.string(), createdBy: v.string() }).index("uuid", ["id"]).index("date", ["date"]),
  support: defineTable({ createdAt: v.number(), userId: v.string(), username: v.string(), payload: v.string(), resolved: v.boolean() }).index("created", ["createdAt"]),
  // Personal tokens for phone shortcuts and widgets; only the SHA-256 hash is stored.
  apiTokens: defineTable({ userId: v.string(), name: v.string(), tokenHash: v.string(), hint: v.string(), deviceId: v.string(), createdAt: v.number(), lastUsedAt: v.optional(v.number()) }).index("hash", ["tokenHash"]).index("user", ["userId"]),
  setup: defineTable({ key: v.literal("admin"), tokenHash: v.string(), expiresAt: v.number(), completed: v.boolean() }).index("key", ["key"]),
});
