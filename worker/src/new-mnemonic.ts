// Prints a fresh 24-word mnemonic for WORKER_TEST_MNEMONIC. Testnet use only.
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

console.log(generateMnemonic(wordlist, 256));
