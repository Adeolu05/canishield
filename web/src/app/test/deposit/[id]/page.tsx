import { notFound } from "next/navigation";
import { DepositStatusView } from "@/views/deposit";
import { depositCheckExists } from "@/lib/deposit-checks";

export const metadata = { title: "Deposit check", robots: { index: false } };

export default async function Page(props: PageProps<"/test/deposit/[id]">) {
  const { id } = await props.params;
  if (!(await depositCheckExists("mainnet", id))) notFound();
  return <DepositStatusView network="mainnet" id={id} />;
}
