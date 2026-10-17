import { getMigrations } from "better-auth/db/migration";
import { auth, pool } from "../lib/auth.ts";
const migrations = await getMigrations(auth.options);
await migrations.runMigrations();
await pool.end();
console.log("Anmeldung eingerichtet.");
