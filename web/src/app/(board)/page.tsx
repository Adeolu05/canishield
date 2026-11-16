import type { Metadata } from "next";
import { BoardView } from "@/views/board";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function MainnetBoardPage() {
  return <BoardView network="mainnet" />;
}
