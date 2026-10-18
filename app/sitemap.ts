import type { MetadataRoute } from "next";
import { SITE, restCategories, restProducts } from "@/lib/fsrest";
import { catalogOrNull } from "@/lib/catalog";

export const revalidate = 21600; // rebuild every 6 hours

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cat = await catalogOrNull();
  const [cats, products] = cat
    ? [cat.categories.map((c) => ({ ...c, _updated: undefined as string | undefined })), cat.products.map((p) => ({ ...p, _updated: undefined as string | undefined }))]
    : await Promise.all([restCategories(), restProducts()]);
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/categories`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/offers`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/suppliers`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    ...cats.map((c) => ({ url: `${SITE}/c/${c.id}`, lastModified: c._updated ? new Date(c._updated) : now, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE}/product/${p.id}`, lastModified: p._updated ? new Date(p._updated) : now, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
