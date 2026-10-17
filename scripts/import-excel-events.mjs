import { neon } from "@neondatabase/serverless";
import { execFileSync } from "child_process";
import crypto from "crypto";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
const sql = neon(process.env.DATABASE_URL);

const extractedJson = execFileSync("python3", ["scripts/extract-events.py"], { encoding: "utf8" });
const items = JSON.parse(extractedJson);

console.log(`Gefundene Events aus Excel: ${items.length}`);

// Ensure table exists
await sql`CREATE TABLE IF NOT EXISTS chaxter_events (
  id uuid PRIMARY KEY,
  event_date date NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
)`;
await sql`CREATE INDEX IF NOT EXISTS idx_chaxter_events_date ON chaxter_events(event_date)`;

// Prepare payload
const payload = items.map((item) => ({
  id: crypto.randomUUID(),
  event_date: item.date,
  title: item.title,
  description: item.description ?? null,
  created_by: "Excel-Import (Tagesliste 2026)",
}));

await sql`
  INSERT INTO chaxter_events (id, event_date, title, description, created_by)
  SELECT id, event_date::date, title, description, created_by
  FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb)
    AS batch(id uuid, event_date text, title text, description text, created_by text)
  ON CONFLICT (id) DO NOTHING
`;

const countResult = await sql`SELECT count(*)::int as count FROM chaxter_events`;
console.log(`Erfolgreich eingetragen. Gesamtzahl Events in Datenbank: ${countResult[0].count}`);
