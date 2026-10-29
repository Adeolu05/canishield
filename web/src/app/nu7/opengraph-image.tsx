import { ogImage, OG_SIZE } from "@/lib/og";
import { NU7_HEIGHT, NU7_PLANNED_DATE } from "@/lib/nu7";

export const alt = "Ready for NU7? What to do before Zcash's network upgrade";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    network: "mainnet",
    eyebrow: "Zcash network upgrade",
    title: "Ready for NU7?",
    lines: [{ text: `Activates at block ${NU7_HEIGHT.toLocaleString("en-US")}` }, { text: `Planned for around ${NU7_PLANNED_DATE}` }],
  });
}
