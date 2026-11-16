import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/sitemap";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(SITE_URL);
}
