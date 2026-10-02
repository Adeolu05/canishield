// Runs before this segment's loading boundary, so an unknown id returns a real 404 status.
import { notFound } from "next/navigation";
import { testExists } from "@/lib/queries";

export default async function Layout({ children, params }: LayoutProps<"/test/[id]">) {
  const { id } = await params;
  if (!(await testExists("mainnet", id))) notFound();
  return children;
}
