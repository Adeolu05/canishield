import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { createDb } from "./index";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (see .env.example).");
// Say where the migrations go (host and database only, never the password).
const target = new URL(process.env.DATABASE_URL);
console.log(`Applying migrations to ${target.hostname}${target.pathname}`);

const db = createDb();
const client = db.$client;
const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });

// Same bookkeeping as drizzle-orm's migrator (drizzle.__drizzle_migrations: hash
// and created_at = the journal's timestamp), so databases migrated before keep
// working. The difference: each migration runs in its own transaction. Drizzle
// runs every pending migration in one transaction, and Postgres refuses to use
// an enum value added by ALTER TYPE ... ADD VALUE in the transaction that added
// it, so a fresh database failed at 0006 (which uses 'form_accepted' from 0001).
await client`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
await client`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
const [last] = await client<{ created_at: string }[]>`SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`;

let applied = 0;
for (const migration of migrations) {
  if (last && Number(last.created_at) >= migration.folderMillis) continue;
  await client.begin(async (tx) => {
    for (const stmt of migration.sql) {
      if (stmt.trim()) await tx.unsafe(stmt);
    }
    await tx`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES (${migration.hash}, ${migration.folderMillis})`;
  });
  applied++;
}
console.log(applied ? `Migrations applied (${applied}).` : "Migrations applied (already up to date).");
await client.end();
