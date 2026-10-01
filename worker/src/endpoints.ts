// Primary + fallback lightwalletd/Zaino endpoints.
import zcash from "@ledgerhq/zcash-utils";
import { ENDPOINT_TIMEOUT_MS } from "./config";
import { connect, getLightdInfo } from "./lightwalletd";

export interface Endpoint {
  url: string;
  client: ReturnType<typeof connect>;
}

export interface HealthyEndpoint extends Endpoint {
  tip: number;
}

/** An endpoint answered but is on the wrong chain. Always fatal. */
export class WrongChainError extends Error {}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);

export function openEndpoints(urls: string[]): Endpoint[] {
  if (urls.length === 0) throw new Error("No lightwalletd endpoints configured.");
  return urls.map((url) => ({ url, client: connect(url) }));
}

/**
 * Returns the first endpoint that answers and reports `chainName`. An endpoint
 * on the wrong chain is a hard error, not a reason to fall through.
 */
export async function pickEndpoint(endpoints: Endpoint[], chainName: "main" | "test"): Promise<HealthyEndpoint> {
  const failures: string[] = [];
  for (const ep of endpoints) {
    let info;
    try {
      info = await withTimeout(getLightdInfo(ep.client), ENDPOINT_TIMEOUT_MS);
    } catch (err) {
      failures.push(`${ep.url}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (info.chainName !== chainName) {
      throw new WrongChainError(`Endpoint ${ep.url} reports chain "${info.chainName}", not "${chainName}". Refusing to run.`);
    }
    try {
      const tip = await withTimeout(zcash.getChainTip(ep.url), ENDPOINT_TIMEOUT_MS);
      return { ...ep, tip };
    } catch (err) {
      failures.push(`${ep.url}: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw new Error(`No endpoint available:\n  ${failures.join("\n  ")}`);
}

export const closeEndpoints = (endpoints: Endpoint[]) => endpoints.forEach((ep) => ep.client.close());
