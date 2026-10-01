// Testnet-capable services to start the board with. Idempotent.
import { createDb, services, tests } from "./index";

const db = createDb();

const seeded = await db
  .insert(services)
  .values([
    {
      slug: "fauzec",
      name: "fauzec testnet faucet",
      kind: "faucet",
      websiteUrl: "https://fauzec.com",
      notes: "Public testnet faucet. Used for the day-1 spike.",
    },
    {
      slug: "zingo",
      name: "Zingo",
      kind: "wallet",
      websiteUrl: "https://zingolabs.org",
      notes: "Supports testnet.",
    },
  ])
  .onConflictDoNothing({ target: services.slug })
  .returning();

// The day-1 spike receipt: a 1 TAZ fauzec payment to an Orchard-receiver UA
// landed in Ironwood. The spike key was not created by the worker, so no
// account index or viewing key is attached.
const fauzec = seeded.find((s) => s.slug === "fauzec");
if (fauzec) {
  await db.insert(tests).values({
    serviceId: fauzec.id,
    addressType: "ironwood_ua",
    status: "received",
    receiveAddress:
      "utest1sclyw7zs0l40trha0ks45g04m5srec92vflcy4gyg5nl298y8jqc2nnpp9rxaf2yn64k4vy0usn2fsx0eagh4nj06c8r9w54yuezk0nm",
    receivedPool: "ironwood",
    receivedTxid: "848beda17a4aed8cf04077374b19291f0084dc6e37e0a562f64c9294004d01c5",
    receivedHeight: 4426910,
    receivedAmountZat: 100_000_000,
    receivedMemo: "fauzec/v1\n01M3VA4PF8XT9ZS9SF0PZTR1R1\n1790930629277\nhttps://fauzec.com/help",
    testerNote: "Day-1 spike (spike/), recorded manually.",
    receivedAt: new Date(),
  });
}

console.log(`Seeded ${seeded.length} new service(s).`);
await db.$client.end();
