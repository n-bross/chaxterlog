import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
const sql = neon(process.env.DATABASE_URL);

await sql`CREATE TABLE IF NOT EXISTS chaxter_events (
  id uuid PRIMARY KEY,
  event_date date NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
)`;

await sql`CREATE INDEX IF NOT EXISTS idx_chaxter_events_date ON chaxter_events(event_date)`;

console.log("chaxter_events Tabelle bereit.");
