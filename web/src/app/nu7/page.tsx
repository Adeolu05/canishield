import type { Metadata } from "next";
import { Nu7View } from "@/views/nu7";
import { NU7_HEIGHT } from "@/lib/nu7";

export const metadata: Metadata = {
  title: "Ready for NU7?",
  description:
    `Zcash's NU7 upgrade activates at block ${NU7_HEIGHT.toLocaleString("en-US")}. A live countdown, what wallet users, Sprout holders, exchange users and node operators need to do, and what changes, with sources.`,
};

export default function Nu7Page() {
  return <Nu7View />;
}
