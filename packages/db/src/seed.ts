// Testnet-capable services to start the board with. Idempotent: safe to rerun.
import { eq } from "drizzle-orm";
import { createDb, services, tests } from "./index";

const db = createDb();

const added = await db
  .insert(services)
  .values([
    {
      slug: "fauzec",
      name: "fauzec testnet faucet",
      kind: "faucet",
      websiteUrl: "https://fauzec.com",
      notes: "Public testnet faucet: 1 TAZ per address per 24h, UA and Sapling addresses only. Used for the day-1 spike.",
    },
    {
      slug: "valar-faucet",
      name: "Valar testnet faucet",
      kind: "faucet",
      websiteUrl: "https://faucet.testnet.valargroup.dev",
      notes: "Public testnet faucet: 0.125 TAZ per IP per day, all address types, global daily cap.",
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
  .returning({ slug: services.slug });

// The day-1 spike receipt: a 1 TAZ fauzec payment to an Orchard-receiver UA
// landed in Ironwood. The spike key was not created by the worker (no account
// index), but its viewing key is published: the wallet holds only this 1 TAZ.
const SPIKE_TXID = "848beda17a4aed8cf04077374b19291f0084dc6e37e0a562f64c9294004d01c5";
const SPIKE_UFVK =
  "uviewtest1fn5enlj4jnvsrmrecfk6qmgtfemethd440x93xg292zg3jytcu728gj8yvghrykfyj3h0tpmlcvu9v58pk9zdqmc2k4gtuwjsnm7tz46kuaagcphpgfpfwaljyyek3tlpyjmfa5sdh4w8sv6fcqx7n5ey7fprht3hn29sl8wd4pjq257fezktg8may9t4zl4rlxyz9p6g7hv9g4xsl39y6z5wp8s0xsj85cvevc2f7ydgmqlj8dx7qk0zc04c7724lh7q0yezcytz032qpx3uk9h92xcw6hxlpzwm2evc36wdendufh85eyufsr2csyfekq5zjw56prvtpxup599sl2a2a43uz7s6fta533a874zqw265ay8288uzmxedq8kd4zcj394kjv5z0faehw3lsrw5jaukprutk2njsyuuj46877z7k37pudr4d0vt7l0d2jwcawu9q4ymkuwfstt9zngp5ztatv2fgr4fnrqmdsx7etqnv63pvdd";

const [fauzec] = await db.select().from(services).where(eq(services.slug, "fauzec"));
const [spike] = await db.select().from(tests).where(eq(tests.receivedTxid, SPIKE_TXID));
if (spike) {
  await db.update(tests).set({ ufvk: SPIKE_UFVK }).where(eq(tests.id, spike.id));
} else {
  await db.insert(tests).values({
    serviceId: fauzec.id,
    addressType: "ironwood_ua",
    status: "received",
    ufvk: SPIKE_UFVK,
    receiveAddress:
      "utest1sclyw7zs0l40trha0ks45g04m5srec92vflcy4gyg5nl298y8jqc2nnpp9rxaf2yn64k4vy0usn2fsx0eagh4nj06c8r9w54yuezk0nm",
    receivedPool: "ironwood",
    receivedTxid: SPIKE_TXID,
    receivedHeight: 4426910,
    receivedAmountZat: 100_000_000,
    receivedMemo: "fauzec/v1\n01M3VA4PF8XT9ZS9SF0PZTR1R1\n1790930629277\nhttps://fauzec.com/help",
    testerNote: "Day-1 spike (spike/), recorded manually.",
    receivedAt: new Date(),
  });
}

console.log(`Seeded ${added.length} new service(s); spike receipt ${spike ? "updated" : "inserted"}.`);
await db.$client.end();
