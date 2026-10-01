// Unified Address encode/decode (ZIP 316, revision 0), including F4Jumble.
//
// @ledgerhq/zcash-utils only derives the single-receiver Orchard UA. The
// full-UA test needs Orchard + transparent receivers in one address, so we
// decode the package's UA to get the raw Orchard receiver and re-encode it
// alongside a P2PKH receiver.
import { bech32m } from "@scure/base";
import { blake2b } from "@noble/hashes/blake2.js";

export const Typecode = { P2PKH: 0x00, P2SH: 0x01, Sapling: 0x02, Orchard: 0x03 } as const;

export interface Receiver {
  typecode: number;
  data: Uint8Array;
}

const H_PERSONAL = new TextEncoder().encode("UA_F4Jumble_H"); // 13 bytes
const G_PERSONAL = new TextEncoder().encode("UA_F4Jumble_G");
const L_H = 64;

function personal(prefix: Uint8Array, ...tail: number[]) {
  const p = new Uint8Array(16);
  p.set(prefix);
  p.set(tail, prefix.length);
  return p;
}

const hRound = (i: number, u: Uint8Array, outLen: number) =>
  blake2b(u, { dkLen: outLen, personalization: personal(H_PERSONAL, i, 0, 0) });

function gRound(i: number, u: Uint8Array, outLen: number) {
  const out = new Uint8Array(outLen);
  for (let j = 0; j * L_H < outLen; j++) {
    const block = blake2b(u, { dkLen: L_H, personalization: personal(G_PERSONAL, i, j & 0xff, j >> 8) });
    out.set(block.subarray(0, Math.min(L_H, outLen - j * L_H)), j * L_H);
  }
  return out;
}

const xorInto = (a: Uint8Array, b: Uint8Array) => {
  for (let k = 0; k < a.length; k++) a[k] ^= b[k];
};

function split(m: Uint8Array) {
  if (m.length < 48 || m.length > 4194368) throw new Error(`F4Jumble: bad length ${m.length}`);
  const lL = Math.min(L_H, Math.floor(m.length / 2));
  return { a: m.slice(0, lL), b: m.slice(lL) };
}

export function f4jumble(m: Uint8Array) {
  const { a, b } = split(m);
  xorInto(b, gRound(0, a, b.length));
  xorInto(a, hRound(0, b, a.length));
  xorInto(b, gRound(1, a, b.length));
  xorInto(a, hRound(1, b, a.length));
  return new Uint8Array([...a, ...b]);
}

export function f4jumbleInv(m: Uint8Array) {
  const { a, b } = split(m);
  xorInto(a, hRound(1, b, a.length));
  xorInto(b, gRound(1, a, b.length));
  xorInto(a, hRound(0, b, a.length));
  xorInto(b, gRound(0, a, b.length));
  return new Uint8Array([...a, ...b]);
}

const hrpPadding = (hrp: string) => {
  const pad = new Uint8Array(16);
  pad.set(new TextEncoder().encode(hrp));
  return pad;
};

// CompactSize, restricted to the small values UA items use.
function readCompactSize(buf: Uint8Array, at: number): [number, number] {
  const first = buf[at];
  if (first < 0xfd) return [first, at + 1];
  if (first === 0xfd) return [buf[at + 1] | (buf[at + 2] << 8), at + 3];
  throw new Error("UA: unsupported CompactSize");
}

function writeCompactSize(n: number) {
  if (n < 0xfd) return [n];
  if (n <= 0xffff) return [0xfd, n & 0xff, n >> 8];
  throw new Error("UA: CompactSize too large");
}

export function decodeUnifiedAddress(address: string): { hrp: string; receivers: Receiver[] } {
  const { prefix: hrp, words } = bech32m.decode(address as `${string}1${string}`, false);
  const raw = f4jumbleInv(bech32m.fromWords(words));
  const padding = raw.slice(raw.length - 16);
  if (!padding.every((byte, k) => byte === hrpPadding(hrp)[k])) {
    throw new Error("UA: padding mismatch (not a valid unified address)");
  }
  const body = raw.slice(0, raw.length - 16);
  const receivers: Receiver[] = [];
  let at = 0;
  while (at < body.length) {
    const [typecode, afterType] = readCompactSize(body, at);
    const [len, afterLen] = readCompactSize(body, afterType);
    receivers.push({ typecode, data: body.slice(afterLen, afterLen + len) });
    at = afterLen + len;
  }
  return { hrp, receivers };
}

export function encodeUnifiedAddress(hrp: string, receivers: Receiver[]): string {
  // ZIP 316: receivers are encoded in ascending typecode order.
  const sorted = [...receivers].sort((x, y) => x.typecode - y.typecode);
  const body = sorted.flatMap((r) => [...writeCompactSize(r.typecode), ...writeCompactSize(r.data.length), ...r.data]);
  const jumbled = f4jumble(new Uint8Array([...body, ...hrpPadding(hrp)]));
  return bech32m.encode(hrp, bech32m.toWords(jumbled), false);
}
