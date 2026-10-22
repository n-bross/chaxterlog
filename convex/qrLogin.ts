import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";

// A personal login QR code for staff. The code carries "<userId>.<secret>"; only a SHA-256 hash of the
// secret is stored, in Better Auth's verification table under one identifier per user, so creating a
// new code replaces the old one and deleting the identifier revokes it. Admin accounts keep passwords.
export const QR_LOGIN_DAYS = 180;
export const qrIdentifier = (userId: string) => `qr-login:${userId}`;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const invalid = () => new APIError("UNAUTHORIZED", { message: "QR-Code ungültig oder abgelaufen." });

export const qrLogin = () => ({
  id: "qr-login",
  endpoints: {
    createQrLogin: createAuthEndpoint("/qr-login/create", { method: "POST", use: [sessionMiddleware] }, async (ctx) => {
      const user = ctx.context.session.user as { id: string; role?: string | null; twoFactorEnabled?: boolean | null };
      if (user.role === "admin") throw new APIError("FORBIDDEN", { message: "Admins melden sich mit Passwort an." });
      if (user.twoFactorEnabled) throw new APIError("FORBIDDEN", { message: "Mit aktiver 2FA bitte mit Passwort und Authenticator anmelden." });
      const secret = generateRandomString(40);
      const expiresAt = new Date(Date.now() + QR_LOGIN_DAYS * 86_400_000);
      await ctx.context.internalAdapter.deleteVerificationByIdentifier(qrIdentifier(user.id));
      await ctx.context.internalAdapter.createVerificationValue({ identifier: qrIdentifier(user.id), value: await sha256(secret), expiresAt });
      return ctx.json({ token: `${user.id}.${secret}`, expiresAt: expiresAt.toISOString() });
    }),
    qrLoginStatus: createAuthEndpoint("/qr-login/status", { method: "GET", use: [sessionMiddleware] }, async (ctx) => {
      const entry = await ctx.context.internalAdapter.findVerificationValue(qrIdentifier(ctx.context.session.user.id));
      const active = !!entry && new Date(entry.expiresAt).getTime() > Date.now();
      return ctx.json({ active, createdAt: active ? new Date(entry.createdAt).toISOString() : null, expiresAt: active ? new Date(entry.expiresAt).toISOString() : null });
    }),
    revokeQrLogin: createAuthEndpoint("/qr-login/revoke", { method: "POST", use: [sessionMiddleware] }, async (ctx) => {
      await ctx.context.internalAdapter.deleteVerificationByIdentifier(qrIdentifier(ctx.context.session.user.id));
      return ctx.json({ status: true });
    }),
    signInQrLogin: createAuthEndpoint("/qr-login/sign-in", { method: "POST", body: z.object({ token: z.string().min(10).max(200) }) }, async (ctx) => {
      const [userId, secret] = ctx.body.token.split(".");
      if (!userId || !secret) throw invalid();
      const entry = await ctx.context.internalAdapter.findVerificationValue(qrIdentifier(userId));
      if (!entry || new Date(entry.expiresAt).getTime() <= Date.now() || !sameText(entry.value, await sha256(secret))) throw invalid();
      const user = await ctx.context.internalAdapter.findUserById(userId) as ({ id: string; role?: string | null; banned?: boolean | null } & Record<string, unknown>) | null;
      if (!user || user.banned || user.role === "admin") throw invalid();
      if (user.twoFactorEnabled) throw new APIError("FORBIDDEN", { message: "Mit aktiver 2FA bitte mit Passwort und Authenticator anmelden." });
      const session = await ctx.context.internalAdapter.createSession(user.id);
      if (!session) throw invalid();
      await setSessionCookie(ctx, { session, user: user as never });
      return ctx.json({ status: true });
    }),
  },
  rateLimit: [{ pathMatcher: (path: string) => path === "/qr-login/sign-in", window: 60, max: 20 }],
}) satisfies BetterAuthPlugin;
