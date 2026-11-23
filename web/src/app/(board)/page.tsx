import type { Metadata } from "next";
import { BoardView } from "@/views/board";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Rebuild the board about once a minute. Scanner status and live exchange
// pauses are fetched in the browser, so they are not frozen in this HTML.
export const revalidate = 60;

export default function MainnetBoardPage() {
  // A local build with no database still has to succeed. On Vercel the database
  // URL is required, so a missing one fails the build instead of caching an empty board.
  if (!process.env.DATABASE_URL) {
    if (process.env.VERCEL) throw new Error("DATABASE_URL is required to build the homepage.");
    return <p className="text-sm text-muted">The board needs a database connection before it can load.</p>;
  }
  return <BoardView network="mainnet" dynamic={false} />;
}
