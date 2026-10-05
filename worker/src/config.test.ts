import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadConfig } from "./config";

test("defaults to testnet; mainnet needs both flags", () => {
  assert.equal(loadConfig({}).network, "testnet");
  assert.throws(() => loadConfig({ ZECPROOF_NETWORK: "mainnet" }), ConfigError);
  assert.throws(() => loadConfig({ ZECPROOF_NETWORK: "mainnet", ZECPROOF_ALLOW_MAINNET: "true" }), ConfigError);
  assert.throws(() => loadConfig({ ZECPROOF_NETWORK: "main", ZECPROOF_ALLOW_MAINNET: "yes" }), ConfigError);
  assert.equal(loadConfig({ ZECPROOF_NETWORK: "mainnet", ZECPROOF_ALLOW_MAINNET: "yes" }).network, "mainnet");
});

test("mainnet refuses any readable seed and any non-pool key source", () => {
  const base = { ZECPROOF_NETWORK: "mainnet", ZECPROOF_ALLOW_MAINNET: "yes" };
  assert.throws(() => loadConfig({ ...base, WORKER_TEST_MNEMONIC: "abandon abandon" }), /must not be able to read any seed/);
  assert.throws(() => loadConfig({ ...base, ZECPROOF_KEY_SOURCE: "derived" }), ConfigError);
  assert.equal(loadConfig(base).keySource, "pool");
});

test("mainnet enforces at least 10 confirmations and the explorer check", () => {
  const c = loadConfig({ ZECPROOF_NETWORK: "mainnet", ZECPROOF_ALLOW_MAINNET: "yes", ZECPROOF_REQUIRED_CONFIRMATIONS: "2" });
  assert.equal(c.requiredConfirmations, 10);
  assert.equal(c.explorerCheck, true);
});

test("each network reads only its own endpoint list", () => {
  const env = { ZECPROOF_TESTNET_GRPC_URLS: "https://t.example:443", ZECPROOF_MAINNET_GRPC_URLS: "https://m.example:443" };
  assert.deepEqual(loadConfig(env).grpcUrls, ["https://t.example:443"]);
  assert.deepEqual(
    loadConfig({ ...env, ZECPROOF_NETWORK: "mainnet", ZECPROOF_ALLOW_MAINNET: "yes" }).grpcUrls,
    ["https://m.example:443"],
  );
});

test("testnet can rehearse mainnet rules; key source follows the seed", () => {
  const c = loadConfig({ ZECPROOF_REQUIRED_CONFIRMATIONS: "10", ZECPROOF_EXPLORER_CHECK: "on" });
  assert.equal(c.requiredConfirmations, 10);
  assert.equal(c.explorerCheck, true);
  assert.equal(loadConfig({ WORKER_TEST_MNEMONIC: "x" }).keySource, "derived");
  assert.equal(loadConfig({}).keySource, "pool");
});

test("a pool worker refuses a readable seed on any network", () => {
  assert.throws(() => loadConfig({ ZECPROOF_KEY_SOURCE: "pool", WORKER_TEST_MNEMONIC: "abandon abandon" }), /uses the key pool/);
  assert.equal(loadConfig({ ZECPROOF_KEY_SOURCE: "pool" }).keySource, "pool");
});
