import { TestStatusView } from "@/views/test-status";

export const metadata = { title: "Test status (testnet)" };

export default async function TestnetTestPage(props: PageProps<"/testnet/test/[id]">) {
  const { id } = await props.params;
  return <TestStatusView network="testnet" id={id} />;
}
