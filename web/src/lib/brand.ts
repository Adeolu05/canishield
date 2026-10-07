// The product's public name. "Can I Shield?" in headings, titles and OG images;
// "CanIShield" where a question mark reads wrong (wordmark, <title> suffix,
// mid-sentence, export source). Internal identifiers keep the zecproof prefix
// (npm packages @zecproof/*, ZECPROOF_* env vars, DB names, folders).
export const BRAND = {
  name: "Can I Shield?",
  compact: "CanIShield",
  url: "https://canishield.vercel.app",
  description: "Can I send shielded ZEC to this service? Live, re-checkable answers for wallets and exchanges.",
} as const;

/** The mark's check stroke: on the gold shield, "yes, this works". Shared by the logo, favicon and OG images. */
export const MARK_SHIELD = "M16 2.5 4.5 6.8v8.4c0 7.2 4.8 12.6 11.5 14.3 6.7-1.7 11.5-7.1 11.5-14.3V6.8L16 2.5Z";
export const MARK_CHECK = "M10.5 16.2l3.8 3.8 7.2-7.6";
