// Minimal lightwalletd/Zaino gRPC client for the calls @ledgerhq/zcash-utils
// does not expose: server info (for the testnet guard) and transparent UTXOs.
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PROTO = fileURLToPath(new URL("../proto/service.proto", import.meta.url));

export interface LightdInfo {
  version: string;
  vendor: string;
  chainName: string;
  blockHeight: string;
}

export interface AddressUtxo {
  address: string;
  txid: string; // display (big-endian) order
  index: number;
  valueZat: number;
  height: number;
}

type Callback<T> = (err: grpc.ServiceError | null, res: T) => void;
interface Client extends grpc.Client {
  GetLightdInfo(req: object, cb: Callback<LightdInfo>): void;
  GetAddressUtxos(
    req: { addresses: string[]; startHeight: number; maxEntries: number },
    cb: Callback<{ addressUtxos: Array<Omit<AddressUtxo, "txid"> & { txid: Buffer }> }>,
  ): void;
}

export function connect(grpcUrl: string): Client {
  const url = new URL(grpcUrl);
  const def = protoLoader.loadSync(PROTO, { longs: String, defaults: true });
  const pkg = grpc.loadPackageDefinition(def) as any;
  const Streamer = pkg.cash.z.wallet.sdk.rpc.CompactTxStreamer;
  const creds =
    url.protocol === "https:" ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  return new Streamer(`${url.hostname}:${url.port || 443}`, creds) as Client;
}

const call = <T>(fn: (cb: Callback<T>) => void) =>
  new Promise<T>((resolve, reject) => fn((err, res) => (err ? reject(err) : resolve(res))));

export const getLightdInfo = (c: Client) => call<LightdInfo>((cb) => c.GetLightdInfo({}, cb));

/** True if any transaction touched `address` in [start, end]. Stops at the first one. */
export function hasTaddressHistory(c: Client, address: string, start: number, end: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let done = false;
    const stream = (c as unknown as { GetTaddressTxids(req: object): grpc.ClientReadableStream<unknown> }).GetTaddressTxids({
      address,
      range: { start: { height: start }, end: { height: end } },
    });
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    stream.on("data", () => {
      finish(true);
      stream.cancel();
    });
    stream.on("end", () => finish(false));
    stream.on("error", (err: grpc.ServiceError) => {
      if (done || err.code === grpc.status.CANCELLED) return;
      done = true;
      reject(err);
    });
  });
}

export async function getAddressUtxos(c: Client, address: string, startHeight: number) {
  const res = await call<Awaited<ReturnType<Client["GetAddressUtxos"]>> & any>((cb) =>
    c.GetAddressUtxos({ addresses: [address], startHeight, maxEntries: 0 }, cb),
  );
  return (res.addressUtxos as any[]).map(
    (u): AddressUtxo => ({
      address: u.address,
      // lightwalletd returns txids in internal (little-endian) byte order.
      txid: Buffer.from(u.txid).reverse().toString("hex"),
      index: u.index,
      valueZat: Number(u.valueZat),
      height: Number(u.height),
    }),
  );
}
