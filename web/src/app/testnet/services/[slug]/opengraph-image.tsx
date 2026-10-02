import { serviceOgImage } from "@/lib/og-pages";
import { OG_SIZE } from "@/lib/og";

export const alt = "ZecProof testnet verdict for this service";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return serviceOgImage("testnet", slug);
}
