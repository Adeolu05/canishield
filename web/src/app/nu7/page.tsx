import type { Metadata } from "next";
import { Nu7View } from "@/views/nu7";
import { NU7_HEIGHT, nu7State } from "@/lib/nu7";
import { getNu7Snapshot } from "@/lib/nu7-data";

const H = NU7_HEIGHT.toLocaleString("en-US");

// The preview image URL carries the blocks-left count, so a link shared later
// gets a card with the count at that time instead of a stale cached one.
export async function generateMetadata(): Promise<Metadata> {
  const snap = await getNu7Snapshot();
  const state = nu7State(snap.tip, null, NU7_HEIGHT, snap.spacingS);
  const key = state.phase === "upcoming" ? String(state.blocksLeft) : state.phase;
  const image = { url: `/nu7/card?f=wide&b=${key}`, width: 1200, height: 630, alt: "Ready for NU7? A live countdown to Zcash's network upgrade" };
  const description = `Zcash's NU7 upgrade activates at block ${H}. A live countdown from our own scanner, what wallet users, Sprout holders, exchange users and node operators need to do, and what changes, with sources.`;
  return {
    title: "Ready for NU7?",
    description,
    openGraph: { title: "Ready for NU7?", description, images: [image] },
    twitter: { card: "summary_large_image", title: "Ready for NU7?", description, images: [image.url] },
  };
}

export default function Nu7Page() {
  return <Nu7View />;
}
