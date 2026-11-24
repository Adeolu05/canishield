import { boardOgImage } from "@/lib/og-pages";
import { OG_SIZE } from "@/lib/og";

export const alt = "Can I Shield? Which services can send shielded ZEC, and how each answer was checked";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return boardOgImage("mainnet");
}
