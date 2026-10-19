import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { admin, username } from "better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authSchema from "./betterAuth/schema";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, { local: { schema: authSchema } });
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  appName: "ChaxterLog", baseURL: process.env.SITE_URL, secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.SITE_URL!], database: authComponent.adapter(ctx),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10, maxPasswordLength: 128 },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 60, customRules: { "/sign-in/username": { window: 60, max: 5 } } },
  user: { changeEmail: { enabled: false } },
  disabledPaths: ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/reset-password", "/update-user", "/change-email", "/delete-user"],
  plugins: [admin(), username({ minUsernameLength: 3, maxUsernameLength: 30, usernameValidator: (value: string) => /^[a-z0-9_.-]{3,30}$/i.test(value) }), convex({ authConfig })],
}) satisfies BetterAuthOptions;
export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
export async function requireActor(ctx: GenericCtx<DataModel>, adminOnly = false) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user || user.banned) throw new Error("Anmeldung erforderlich.");
  if (adminOnly && user.role !== "admin") throw new Error("Admin erforderlich.");
  return { id: user._id, username: user.username ?? user.name, role: user.role ?? "user" };
}
export const currentUser = query({ args: {}, handler: async (ctx) => {
  const user = await authComponent.safeGetAuthUser(ctx);
  return user && !user.banned ? { id: user._id, username: user.username ?? user.name, role: user.role ?? "user" } : null;
} });
