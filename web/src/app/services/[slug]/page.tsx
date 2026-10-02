import { serviceMetadata } from "@/lib/service-meta";
import { ServiceView } from "@/views/service";

export default async function MainnetServicePage(props: PageProps<"/services/[slug]">) {
  const { slug } = await props.params;
  return <ServiceView network="mainnet" slug={slug} />;
}

export async function generateMetadata(props: PageProps<"/services/[slug]">) {
  const { slug } = await props.params;
  return serviceMetadata("mainnet", slug);
}
