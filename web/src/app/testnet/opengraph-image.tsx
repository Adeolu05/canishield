import { boardOgImage } from "@/lib/og-pages";
import { OG_SIZE } from "@/lib/og";

export const alt = "ZecProof testnet board";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return boardOgImage("testnet");
}
