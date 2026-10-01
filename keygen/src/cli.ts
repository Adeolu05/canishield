// ZecProof offline key tool. Never imported by the worker or the web app.
//
//   generate  make a batch: N fresh seeds (one per test), an encrypted seeds
//             file, and a public file with viewing keys + addresses only
//   verify    record that one seed, restored in a wallet (e.g. Zingo), shows
//             receivers matching the batch. The worker refuses unverified batches.
//   reveal    decrypt and print one seed (for your password manager, or to
//             restore it in a wallet)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { compareWalletAddresses, isNetworkId, parseBatchPublic } from "@zecproof/zcash";
import { decryptSeeds, type SeedsFile } from "./crypto";
import { generateBatch } from "./generate";
import { enclosingGitRepo, looksOnline } from "./safety";

const USAGE = `Usage:
  npm run keygen -w keygen -- generate --network <testnet|mainnet> --count <n> --birthday <height> --out <dir> [--allow-online]
  npm run keygen -w keygen -- verify --batch <file.public.json> --index <i> --address <addr> [--address <addr>]
  npm run keygen -w keygen -- reveal --seeds <file.seeds.enc.json> --index <i>`;

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Reads a passphrase without echoing it. ZECPROOF_KEYGEN_PASSPHRASE is for automation only. */
async function readPassphrase(prompt: string): Promise<string> {
  const fromEnv = process.env.ZECPROOF_KEYGEN_PASSPHRASE;
  if (fromEnv) {
    console.error("! Using ZECPROOF_KEYGEN_PASSPHRASE from the environment. Do not do this for real keys.");
    return fromEnv;
  }
  if (!process.stdin.isTTY) fail("No terminal to read a passphrase from.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let muted = false;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (!muted) process.stdout.write(s);
  };
  return new Promise((resolvePass) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolvePass(answer);
    });
    muted = true;
  });
}

async function generate(args: Record<string, string | boolean | string[] | undefined>) {
  const network = args.network;
  if (!isNetworkId(network)) fail("--network must be testnet or mainnet (there is no default).");
  const count = Number(args.count);
  const birthday = Number(args.birthday);
  if (typeof args.out !== "string") fail("--out <dir> is required.");
  const out = resolve(args.out);

  const repo = enclosingGitRepo(out);
  if (repo) fail(`--out is inside a git working tree (${repo}). Seeds must never be near a repository.`);
  if (network === "mainnet" && !args["allow-online"] && (await looksOnline())) {
    fail("This machine appears to be online. Generate mainnet keys on an offline machine (or pass --allow-online).");
  }

  const passphrase = await readPassphrase("Passphrase for the encrypted seeds file: ");
  if ((await readPassphrase("Repeat passphrase: ")) !== passphrase) fail("Passphrases do not match.");

  console.log(`Generating ${count} ${network} seed(s)…`);
  const { batch, seeds } = generateBatch({ network, count, birthdayHeight: birthday, passphrase });
  mkdirSync(out, { recursive: true });
  const publicFile = join(out, `${batch.batchId}.public.json`);
  const seedsFile = join(out, `${batch.batchId}.seeds.enc.json`);
  for (const f of [publicFile, seedsFile]) if (existsSync(f)) fail(`${f} already exists.`);
  writeFileSync(seedsFile, JSON.stringify(seeds, null, 2), { mode: 0o600 });
  writeFileSync(publicFile, JSON.stringify(batch, null, 2));

  console.log(`
Batch ${batch.batchId}
  Keys derived by: ${batch.derivation}

  Public file (viewing keys + addresses, safe to copy online):
    ${publicFile}
  Encrypted seeds (keep offline; back up to your password manager + one offline copy):
    ${seedsFile}

Next, before this batch is used:
  1. npm run keygen -w keygen -- reveal --seeds "${seedsFile}" --index 0
  2. Restore that seed in Zingo (${network}), copy the unified address it shows
     (and its transparent address, if shown).
  3. npm run keygen -w keygen -- verify --batch "${publicFile}" --index 0 --address <zingo-ua> [--address <zingo-t-address>]
  4. Copy only the public file to the worker host and run: npm run pool:import -w worker -- "<public file>"
`);
}

function verify(args: Record<string, string | boolean | string[] | undefined>) {
  if (typeof args.batch !== "string") fail("--batch <file.public.json> is required.");
  const index = Number(args.index ?? 0);
  const addresses = (args.address as string[] | undefined) ?? [];
  if (addresses.length === 0) fail("Pass at least one --address copied from the wallet.");
  const batch = parseBatchPublic(JSON.parse(readFileSync(args.batch, "utf8")));
  const result = compareWalletAddresses(batch, index, addresses);
  batch.verification = { ...result, verifiedAt: new Date().toISOString() };
  writeFileSync(args.batch, JSON.stringify(batch, null, 2));
  console.log(`✔ Key ${index} of ${batch.batchId} matches the wallet: ${result.matched.join(", ")}`);
  if (result.unchecked.length) console.log(`  Not checked (not derivable here): ${result.unchecked.join(", ")}`);
  console.log(`  Recorded in ${basename(args.batch)}. The batch can now be imported.`);
}

async function reveal(args: Record<string, string | boolean | string[] | undefined>) {
  if (typeof args.seeds !== "string") fail("--seeds <file.seeds.enc.json> is required.");
  const index = Number(args.index);
  if (!Number.isInteger(index)) fail("--index <i> is required.");
  const file = JSON.parse(readFileSync(args.seeds, "utf8")) as SeedsFile;
  const seeds = decryptSeeds(file, await readPassphrase("Passphrase: "));
  const entry = seeds.find((s) => s.index === index);
  if (!entry) fail(`No seed ${index} in this file.`);
  console.log(`\n${file.batchId} #${index} (${file.network}):\n\n  ${entry.mnemonic}\n\nClear your terminal when done.`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      network: { type: "string" },
      count: { type: "string" },
      birthday: { type: "string" },
      out: { type: "string" },
      "allow-online": { type: "boolean" },
      batch: { type: "string" },
      seeds: { type: "string" },
      index: { type: "string" },
      address: { type: "string", multiple: true },
    },
  });
  try {
    if (command === "generate") await generate(values);
    else if (command === "verify") verify(values);
    else if (command === "reveal") await reveal(values);
    else fail(USAGE);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

await main();
