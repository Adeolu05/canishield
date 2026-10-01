import { ServiceView } from "@/views/service";

export default async function MainnetServicePage(props: PageProps<"/services/[slug]">) {
  const { slug } = await props.params;
  return <ServiceView network="mainnet" slug={slug} />;
}
