import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
const sql = neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS chaxter_visits (
  id uuid PRIMARY KEY, age_group text NOT NULL CHECK (age_group IN ('u15', 'o15')),
  occurred_at timestamptz NOT NULL, click_order double precision NOT NULL,
  cancelled boolean NOT NULL DEFAULT false
)`;
await sql`ALTER TABLE chaxter_visits
  ADD COLUMN IF NOT EXISTS device_id uuid,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS imported_by text,
  ADD COLUMN IF NOT EXISTS legacy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz`;
await sql`CREATE TABLE IF NOT EXISTS chaxter_devices (
  id uuid PRIMARY KEY, name text NOT NULL, platform text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), last_user text
)`;
await sql`CREATE TABLE IF NOT EXISTS chaxter_setup (
  id integer PRIMARY KEY CHECK (id = 1), token_hash text NOT NULL,
  expires_at timestamptz NOT NULL, completed boolean NOT NULL DEFAULT false
)`;
await sql`CREATE TABLE IF NOT EXISTS chaxter_support_reports (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id text,
  username text,
  device_id uuid,
  device_name text,
  platform text,
  notes text,
  user_agent text,
  app_version text,
  is_online boolean NOT NULL DEFAULT true,
  unsynced_count integer NOT NULL DEFAULT 0,
  today_counts jsonb,
  queue_sample jsonb,
  system_info jsonb,
  resolved boolean NOT NULL DEFAULT false
)`;
await sql`ALTER TABLE chaxter_support_reports
  ADD COLUMN IF NOT EXISTS user_agent text`;

const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const inserted = await sql`INSERT INTO chaxter_setup (id, token_hash, expires_at)
  VALUES (1, ${hash}, now() + interval '7 days') ON CONFLICT DO NOTHING RETURNING id`;
if (inserted.length) {
  writeFileSync(".vercel/admin-setup-link.txt", `https://chaxterlog.vercel.app/einrichten#${token}`, { mode: 0o600 });
  console.log("Einmaliger Einrichtungslink in .vercel/admin-setup-link.txt gespeichert.");
}
console.log("ChaxterLog-Datenbank bereit.");
await import("./setup-corrections.mjs");
await import("./setup-visit-sync.mjs");
