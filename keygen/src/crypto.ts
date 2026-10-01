// Passphrase encryption for the seeds file: scrypt KDF + AES-256-GCM.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const SEEDS_FORMAT = "zecproof-key-seeds/1";

// N=2^17, r=8 → 128 MiB per derivation; slow enough to resist guessing.
const SCRYPT = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export interface SeedsFile {
  format: typeof SEEDS_FORMAT;
  batchId: string;
  network: string;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: { name: "aes-256-gcm"; iv: string; tag: string };
  data: string;
}

export interface SeedEntry {
  index: number;
  mnemonic: string;
}

export const MIN_PASSPHRASE_LENGTH = 12;

export function encryptSeeds(batchId: string, network: string, seeds: SeedEntry[], passphrase: string): SeedsFile {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  // Bind the ciphertext to its batch so files cannot be swapped unnoticed.
  cipher.setAAD(Buffer.from(`${SEEDS_FORMAT}:${batchId}:${network}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(seeds), "utf8"), cipher.final()]);
  return {
    format: SEEDS_FORMAT,
    batchId,
    network,
    kdf: { name: "scrypt", N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString("base64") },
    cipher: { name: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
    data: data.toString("base64"),
  };
}

export function decryptSeeds(file: SeedsFile, passphrase: string): SeedEntry[] {
  if (file.format !== SEEDS_FORMAT) throw new Error("Not a ZecProof seeds file.");
  const { N, r, p } = file.kdf;
  const key = scryptSync(passphrase, Buffer.from(file.kdf.salt, "base64"), 32, { N, r, p, maxmem: SCRYPT.maxmem });
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.cipher.iv, "base64"));
  decipher.setAAD(Buffer.from(`${SEEDS_FORMAT}:${file.batchId}:${file.network}`));
  decipher.setAuthTag(Buffer.from(file.cipher.tag, "base64"));
  try {
    const plain = Buffer.concat([decipher.update(Buffer.from(file.data, "base64")), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as SeedEntry[];
  } catch {
    throw new Error("Wrong passphrase, or the seeds file is damaged.");
  }
}
