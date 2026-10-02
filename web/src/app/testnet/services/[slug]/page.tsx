import { serviceMetadata } from "@/lib/service-meta";
import { ServiceView } from "@/views/service";

export default async function TestnetServicePage(props: PageProps<"/testnet/services/[slug]">) {
  const { slug } = await props.params;
  return <ServiceView network="testnet" slug={slug} />;
}

export async function generateMetadata(props: PageProps<"/testnet/services/[slug]">) {
  const { slug } = await props.params;
  return serviceMetadata("testnet", slug);
}
