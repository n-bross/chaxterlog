import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
await sql`ALTER TABLE chaxter_visits ADD COLUMN IF NOT EXISTS redo_of uuid`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS chaxter_visits_redo_once ON chaxter_visits(redo_of) WHERE redo_of IS NOT NULL`;
await sql`CREATE TABLE IF NOT EXISTS chaxter_corrections (
  id uuid PRIMARY KEY, visit_id uuid NOT NULL REFERENCES chaxter_visits(id),
  kind text NOT NULL CHECK (kind IN ('undo','redo')), occurred_at timestamptz NOT NULL,
  click_order double precision NOT NULL, user_id text, username text,
  device_id uuid, device_name text, platform text,
  received_at timestamptz NOT NULL DEFAULT now()
)`;
await sql`CREATE INDEX IF NOT EXISTS chaxter_corrections_visit ON chaxter_corrections(visit_id)`;
await sql`CREATE INDEX IF NOT EXISTS chaxter_corrections_time ON chaxter_corrections(occurred_at)`;
// Earlier Undo actions have known server time/user, but their operating device was not recorded.
await sql`INSERT INTO chaxter_corrections(id, visit_id, kind, occurred_at, click_order, username)
  SELECT id, id, 'undo', cancelled_at, extract(epoch FROM cancelled_at)*1000, cancelled_by
  FROM chaxter_visits WHERE cancelled AND cancelled_at IS NOT NULL
  ON CONFLICT (id) DO NOTHING`;
console.log("Redo-Verknüpfungen und Korrekturprotokoll bereit; vorhandene Daten erhalten.");
