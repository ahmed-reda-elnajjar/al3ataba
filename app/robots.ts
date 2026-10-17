import type { MetadataRoute } from "next";
import { SITE } from "@/lib/fsrest";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/merchant", "/cart", "/checkout", "/account", "/done", "/login", "/signup"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
