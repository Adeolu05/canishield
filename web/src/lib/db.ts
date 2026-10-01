import "server-only";
import { createDb, type Db } from "@zecproof/db";

// One pool per server process; survives dev hot reloads.
const globalForDb = globalThis as unknown as { zecproofDb?: Db };

export function getDb(): Db {
  globalForDb.zecproofDb ??= createDb();
  return globalForDb.zecproofDb;
}
