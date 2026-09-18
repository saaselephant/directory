import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/config/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/go/"] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
