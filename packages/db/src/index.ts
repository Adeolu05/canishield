import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { connectionSettings } from "./connection";

export * from "./schema";
export { schema };
export { connectionSettings };

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
  const { url: cleanUrl, options } = connectionSettings(url);
  const client = postgres(cleanUrl, options);
  return Object.assign(drizzle(client, { schema }), { $client: client });
}

export type Db = ReturnType<typeof createDb>;
