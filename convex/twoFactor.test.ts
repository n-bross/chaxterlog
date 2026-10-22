/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { betterAuth } from "better-auth/minimal";
import { hashPassword } from "better-auth/crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { createAuthOptions } from "./auth";
import { components } from "./_generated/api";
import schema from "./schema";
import authSchema from "./betterAuth/schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./betterAuth/**"]);
const authModules = import.meta.glob("./betterAuth/**/*.ts");
const origin = "http://localhost:3002";

// Exercise the installed auth plugin through real HTTP requests and the Convex adapter.
test.each(["user", "admin"])("2FA (%s): enrollment, login challenge, recovery, QR bypass protection and disabling", async (role) => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);
  const password = "test-password-12345";
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "anna", username: "anna", email: "anna@example.com", emailVerified: false, role, createdAt: now, updatedAt: now } } });
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: user._id, accountId: user._id, providerId: "credential", password: await hashPassword(password), createdAt: now, updatedAt: now } } });
  const cookies = new Map<string, string>();
  async function post(path: string, body: object, method = "POST") {
    const response = await t.run(async (ctx) => {
      const auth = betterAuth({ ...createAuthOptions(ctx), baseURL: origin, trustedOrigins: [origin], secret: "test-only-secret-with-at-least-32-characters" });
      const response = await auth.handler(new Request(`${origin}/api/auth${path}`, { method, headers: { origin, "content-type": "application/json", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, body: method === "GET" ? undefined : JSON.stringify(body) }));
      return { status: response.status, cookies: response.headers.getSetCookie(), data: await response.json() };
    });
    for (const cookie of response.cookies) {
      const [pair] = cookie.split(";"); const split = pair.indexOf("=");
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return { status: response.status, data: response.data };
  }
  expect((await post("/sign-in/username", { username: "anna", password })).status).toBe(200);
  const qr = await post("/qr-login/create", {});
  expect(qr.status).toBe(role === "admin" ? 403 : 200);
  expect((await post("/two-factor/enable", { password: "wrong" })).status).not.toBe(200);
  const enrollment = await post("/two-factor/enable", { password });
  expect(enrollment.status).toBe(200);
  expect(enrollment.data.backupCodes.length).toBeGreaterThan(0);
  expect((await post("/two-factor/verify-totp", { code: "invalid" })).status).not.toBe(200);
  const secret = new TextDecoder().decode(base32.decode(new URL(enrollment.data.totpURI).searchParams.get("secret")!));
  expect((await post("/two-factor/verify-totp", { code: await createOTP(secret).totp() })).status).toBe(200);
  expect((await post("/qr-login/create", {})).status).toBe(403);
  cookies.clear();
  if (role !== "admin") expect((await post("/qr-login/sign-in", { token: qr.data.token })).status).toBe(403);
  const challenge = await post("/sign-in/username", { username: "anna", password });
  expect(challenge.data.twoFactorRedirect).toBe(true);
  expect((await post("/get-session", {}, "GET")).data).toBeNull();
  expect((await post("/two-factor/verify-backup-code", { code: "wrong" })).status).not.toBe(200);
  expect((await post("/two-factor/verify-backup-code", { code: enrollment.data.backupCodes[0] })).status).toBe(200);
  cookies.clear();
  expect((await post("/sign-in/username", { username: "anna", password })).data.twoFactorRedirect).toBe(true);
  expect((await post("/two-factor/verify-backup-code", { code: enrollment.data.backupCodes[0] })).status).not.toBe(200);
  expect((await post("/two-factor/verify-totp", { code: await createOTP(secret).totp() })).status).toBe(200);
  expect((await post("/two-factor/disable", { password: "wrong" })).status).not.toBe(200);
  expect((await post("/two-factor/disable", { password })).status).toBe(200);
  cookies.clear();
  const login = await post("/sign-in/username", { username: "anna", password });
  expect(login.status).toBe(200);
  expect(login.data.twoFactorRedirect).toBeUndefined();
}, 20000);
