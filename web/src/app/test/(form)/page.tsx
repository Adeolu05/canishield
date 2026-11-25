import { RunTestView } from "@/views/run-test";

export const metadata = { title: "Run a test" };

export default async function MainnetRunTestPage(props: PageProps<"/test">) {
  const { service, busy } = await props.searchParams;
  return <RunTestView network="mainnet" preselected={typeof service === "string" ? service : undefined} busy={busy === "1"} />;
}
