import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { visitChangesQuery, isSyncCursor } from "./visit-changes.ts";

const migration = new URL("../scripts/visit-sync.sql", import.meta.url);
test("database deltas include late uploads, Undo and correction-only changes without replaying history", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE chaxter_visits (id uuid PRIMARY KEY, occurred_at timestamptz NOT NULL, cancelled boolean NOT NULL DEFAULT false);
      CREATE TABLE chaxter_corrections (id uuid PRIMARY KEY, visit_id uuid NOT NULL REFERENCES chaxter_visits(id), kind text NOT NULL, occurred_at timestamptz NOT NULL);`);
    await db.exec("INSERT INTO chaxter_visits(id,occurred_at) VALUES ('e3d907b1-05aa-4eac-89a0-000000000003',now())");
    await db.exec(await readFile(migration, "utf8"));
    const query = visitChangesQuery;
    const poll = async (cursor: string | null = null) => (await db.query<{cursor: string; visits: {id: string; cancelled: boolean}[]; corrections: {id: string}[]}>(query, [cursor])).rows[0];
    const a = "e3d907b1-05aa-4eac-89a0-000000000001", b = "e3d907b1-05aa-4eac-89a0-000000000002";
    await db.query("INSERT INTO chaxter_visits(id,occurred_at) VALUES ($1,now())", [a]);
    const initial = await poll();
    assert.equal(initial.visits.length, 2); // Includes the visit predating the migration.
    assert.deepEqual((await poll(initial.cursor)).visits, []);
    // Old device timestamps must not hide an upload received later.
    await db.query("INSERT INTO chaxter_visits(id,occurred_at) VALUES ($1,'2020-01-01')", [b]);
    const added = await poll(initial.cursor);
    assert.deepEqual(added.visits.map(v => v.id), [b]);
    await db.query("UPDATE chaxter_visits SET cancelled=true WHERE id=$1", [a]);
    const undo = await poll(added.cursor);
    assert.equal(undo.visits[0].id, a);
    assert.equal(undo.visits[0].cancelled, true);
    await db.query("INSERT INTO chaxter_corrections VALUES ($1,$2,'undo',now())", [b,a]);
    const corrected = await poll(undo.cursor);
    assert.equal(corrected.visits[0].id, a);
    assert.equal(corrected.corrections[0].id, b);
    assert.deepEqual((await poll(corrected.cursor)).visits, []);
    await db.exec("BEGIN");
    await db.query("UPDATE chaxter_visits SET cancelled=true WHERE id=$1", [b]);
    await db.exec("ROLLBACK");
    assert.equal((await poll(corrected.cursor)).cursor, corrected.cursor);
    assert.equal((await poll(`${corrected.cursor.split(':')[0]}:999999`)).visits.length, 3);
    assert.equal((await poll("00000000-0000-4000-8000-000000000000:1")).visits.length, 3);
    // Re-running the migration preserves cursors and all existing data.
    await db.exec(await readFile(migration, "utf8"));
    assert.equal((await poll(corrected.cursor)).cursor, corrected.cursor);
  } finally { await db.close(); }
});

test("cursor validation rejects malformed and out-of-range revisions before querying SQL", () => {
  const epoch = "e3d907b1-05aa-4eac-89a0-000000000999";
  for (const value of [null, "", `${epoch}:-1`, `${epoch}:1.5`, `${epoch}:01`, `${epoch}:9223372036854775808`, `${epoch}:1' OR true`]) {
    assert.equal(isSyncCursor(value), false);
  }
  assert.equal(isSyncCursor(`${epoch}:0`), true);
  assert.equal(isSyncCursor(`${epoch}:9223372036854775807`), true);
});
