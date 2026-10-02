import { TestStatusView } from "@/views/test-status";

export const metadata = { title: "Test status" };

export default async function MainnetTestPage(props: PageProps<"/test/[id]">) {
  const { id } = await props.params;
  return <TestStatusView network="mainnet" id={id} />;
}
