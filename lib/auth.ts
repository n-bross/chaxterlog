import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.replace(/sslmode=require(?=&|$)/, "sslmode=verify-full");
export const pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
export const auth = betterAuth({
  appName: "ChaxterLog",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10, maxPasswordLength: 128 },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 60, customRules: { "/sign-in/username": { window: 60, max: 5 } } },
  plugins: [admin(), username({ immutableUsername: true, minUsernameLength: 3, maxUsernameLength: 30, usernameValidator: (value) => /^[a-z0-9_.-]{3,30}$/i.test(value) })],
});
