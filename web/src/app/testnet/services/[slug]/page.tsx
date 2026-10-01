import { ServiceView } from "@/views/service";

export default async function TestnetServicePage(props: PageProps<"/testnet/services/[slug]">) {
  const { slug } = await props.params;
  return <ServiceView network="testnet" slug={slug} />;
}
