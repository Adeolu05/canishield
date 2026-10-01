// npm run pool:import -w worker -- <batch>.public.json
// Online step: loads a verified batch's viewing keys and addresses into key_pool.
import { createDb } from "@zecproof/db";
import { importBatch } from "./pool";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run pool:import -w worker -- <batch>.public.json");
  process.exit(1);
}
if (/seeds/i.test(path)) {
  console.error("That looks like a seeds file. Only the .public.json file belongs on this machine.");
  process.exit(1);
}

const db = createDb();
try {
  const batch = await importBatch(db, path, process.env.ZECPROOF_ALLOW_MAINNET === "yes");
  console.log(`Imported ${batch.keys.length} ${batch.network} key(s) from ${batch.batchId}.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
