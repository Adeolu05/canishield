import type { Metadata } from "next";
import { StatusView } from "@/views/status";

export const metadata: Metadata = {
  title: "Can I move ZEC right now?",
  description:
    "Live ZEC deposit and withdrawal status for exchanges, read from each exchange's own public API every 5 minutes. With a changes feed. Shielded support is on each exchange's record.",
  alternates: { canonical: "/status", types: { "application/atom+xml": [{ url: "/status/feed.xml", title: "Live ZEC deposit and withdrawal changes" }] } },
};

export default function StatusPage() {
  return <StatusView />;
}
