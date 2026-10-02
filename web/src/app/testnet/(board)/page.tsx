import { BoardView } from "@/views/board";

export const metadata = { title: "Testnet board" };

export default function TestnetBoardPage() {
  return <BoardView network="testnet" />;
}
