import { Client } from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
const connectionString = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)
  .replace(/sslmode=require(?=&|$)/, "sslmode=verify-full");
const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
try {
  await client.connect();
  // No parameters: pg uses the simple-query protocol for this atomic SQL script.
  await client.query(await readFile(new URL("./visit-sync.sql", import.meta.url), "utf8"));
  console.log("Inkrementeller Besuchsabgleich bereit; vorhandene Daten erhalten.");
} finally { await client.end(); }
