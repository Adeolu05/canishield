import { BoardView } from "@/views/board";

export const metadata = { title: "Testnet board", alternates: { canonical: "/testnet" } };

export default function TestnetBoardPage() {
  return <BoardView network="testnet" />;
}
