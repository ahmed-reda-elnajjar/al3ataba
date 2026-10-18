import type { Metadata } from "next";
import { SITE, firstImage, minPrice, plain, restProduct } from "@/lib/fsrest";
import { sized } from "@/lib/media";
import { catalogOrNull } from "@/lib/catalog";

/** From the cached catalogue first (0 Firebase reads); direct read only for products not in it yet. */
const find = async (id: string) => (await catalogOrNull())?.products.find((p) => p.id === id) || (await restProduct(id));

/* Server part of the product page: title/description/image for Google & WhatsApp previews + Product structured data. */
type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { id } = await params;
  const p = await find(id);
  if (!p) return { title: "منتج | العتبة أونلاين", robots: { index: false } };
  const price = minPrice(p);
  const title = `${p.name} بسعر الجملة${price ? ` ${price} ج.م` : ""} | العتبة أونلاين`;
  const description = plain(`${p.name} — ${p.categoryName}. سعر جملة يبدأ من ${price} ج.م، أقل طلب ${p.moq} ${p.unit}. ${p.description || "اطلب أونلاين من العتبة مع توصيل لكل محافظات مصر."}`);
  const img = firstImage(p);
  const url = `${SITE}/product/${p.id}`;
  return {
    title, description, alternates: { canonical: url },
    keywords: [p.name, p.categoryName, `${p.name} جملة`, `سعر ${p.name}`, "جملة", "العتبة"],
    openGraph: { title, description, url, type: "website", locale: "ar_EG", siteName: "العتبة أونلاين", images: img ? [{ url: sized(img, 1200), width: 1200, height: 1200 }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: img ? [sized(img, 1200)] : undefined },
  };
}

export default async function ProductLayout({ params, children }: Props) {
  const { id } = await params;
  const p = await find(id);
  const ld = p && {
    "@context": "https://schema.org", "@type": "Product", name: p.name,
    description: plain(p.description || p.name, 500), category: p.categoryName,
    image: (p.images || []).filter((u) => !/\/video\/upload\//.test(u)).slice(0, 5).map((u) => sized(u, 1200)),
    brand: { "@type": "Brand", name: p.merchantName || "العتبة أونلاين" },
    offers: {
      "@type": "AggregateOffer", priceCurrency: "EGP", url: `${SITE}/product/${p.id}`,
      lowPrice: minPrice(p), highPrice: Math.max(...(p.tiers || [{ price: minPrice(p) }]).map((t) => t.price)),
      offerCount: p.tiers?.length || 1, availability: "https://schema.org/InStock",
    },
  };
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      {children}
    </>
  );
}
