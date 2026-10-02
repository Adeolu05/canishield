import { RunTestView } from "@/views/run-test";

export const metadata = { title: "Run a test (testnet)" };

export default async function TestnetRunTestPage(props: PageProps<"/testnet/test">) {
  const { service } = await props.searchParams;
  return <RunTestView network="testnet" preselected={typeof service === "string" ? service : undefined} />;
}
