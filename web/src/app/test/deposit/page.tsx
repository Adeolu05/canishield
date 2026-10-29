import { DepositStartView } from "@/views/deposit";

export const metadata = { title: "Check a deposit" };

export default async function Page(props: PageProps<"/test/deposit">) {
  const { service } = await props.searchParams;
  return <DepositStartView network="mainnet" preselected={typeof service === "string" ? service : undefined} />;
}
