import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (see .env.example).");
// Say where the migrations go (host and database only, never the password).
const target = new URL(process.env.DATABASE_URL);
console.log(`Applying migrations to ${target.hostname}${target.pathname}`);

const db = createDb();
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
console.log("Migrations applied.");
await db.$client.end();
