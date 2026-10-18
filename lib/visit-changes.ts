// One statement gives the cursor, visits and corrections the same MVCC snapshot.
// An unknown epoch or a cursor beyond this database's state requests a full sync.
export const visitChangesQuery = `
WITH state AS (
  SELECT epoch::text || ':' || revision::text AS cursor,
    CASE WHEN split_part($1::text, ':', 1) = epoch::text
      AND split_part($1::text, ':', 2)::bigint <= revision
      THEN split_part($1::text, ':', 2)::bigint ELSE -1 END AS since
  FROM public.chaxter_sync_state WHERE id = 1
), changed AS MATERIALIZED (
  SELECT v.* FROM public.chaxter_visits v, state s
  WHERE v.sync_revision > s.since
)
SELECT s.cursor,
  COALESCE((SELECT jsonb_agg(v ORDER BY v.occurred_at, v.id) FROM changed v), '[]'::jsonb) AS visits,
  COALESCE((SELECT jsonb_agg(c ORDER BY c.occurred_at, c.id)
    FROM public.chaxter_corrections c JOIN changed v ON v.id = c.visit_id), '[]'::jsonb) AS corrections
FROM state s`;

export function isSyncCursor(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(0|[1-9][0-9]{0,18})$/.test(value)
    && BigInt(value.split(":")[1]) <= BigInt("9223372036854775807");
}
