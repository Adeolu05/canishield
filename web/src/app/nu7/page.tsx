import type { Metadata } from "next";
import { Nu7View } from "@/views/nu7";
import { NU7_HEIGHT, cardKey, nu7State } from "@/lib/nu7";
import { getNu7Snapshot } from "@/lib/nu7-data";

const H = NU7_HEIGHT.toLocaleString("en-US");

// The preview image URL carries the blocks-left count, so a link shared later
// gets a card with the count at that time instead of a stale cached one.
export async function generateMetadata(): Promise<Metadata> {
  const snap = await getNu7Snapshot();
  const state = nu7State(snap.tip, null, NU7_HEIGHT, snap.spacingS);
  const key = cardKey(state);
  // After activation the title and text follow the upgrade: a link shared now reads "NU7 is live", not a countdown.
  const live = state.phase === "live";
  const title = live ? "NU7 is live" : "Ready for NU7?";
  const alt = live
    ? "NU7 is live: the average Zcash block gap since NU7, measured by our scanner"
    : "Ready for NU7? A live countdown to Zcash's network upgrade";
  const image = { url: `/nu7/card?f=wide&b=${key}`, width: 1200, height: 630, alt };
  const description = live
    ? `Zcash's NU7 upgrade activated at block ${H}. A live stopwatch from our own scanner: the average block gap before and after NU7, what changed, and what wallet users, Sprout holders, exchange users and node operators should check, with sources.`
    : `Zcash's NU7 upgrade activates at block ${H}. A live countdown from our own scanner, what wallet users, Sprout holders, exchange users and node operators need to do, and what changes, with sources.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function Nu7Page() {
  return <Nu7View />;
}
