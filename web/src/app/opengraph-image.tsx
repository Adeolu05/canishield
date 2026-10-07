import { boardOgImage } from "@/lib/og-pages";
import { OG_SIZE } from "@/lib/og";

export const alt = "Can I Shield? Which services accept shielded ZEC, with on-chain proof";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return boardOgImage("mainnet");
}
