import { TestStatusView } from "@/views/test-status";

export default async function TestnetTestPage(props: PageProps<"/testnet/test/[id]">) {
  const { id } = await props.params;
  return <TestStatusView network="testnet" id={id} />;
}
