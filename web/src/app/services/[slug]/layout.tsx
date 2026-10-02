// Runs before this segment's loading boundary, so an unknown id returns a real 404 status.
import { notFound } from "next/navigation";
import { serviceExists } from "@/lib/queries";

export default async function Layout({ children, params }: LayoutProps<"/services/[slug]">) {
  const { slug } = await params;
  if (!(await serviceExists("mainnet", slug))) notFound();
  return children;
}
