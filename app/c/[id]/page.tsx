import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE, firstImage, minPrice, restCategory, restProducts } from "@/lib/fsrest";
import { sized } from "@/lib/media";
import { ProductCard } from "@/components/Ui";

/* Category landing page rendered on the server, so Google sees the real product names and prices. */
export const revalidate = 3600;
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await restCategory(id);
  if (!c) return { title: "قسم | العتبة أونلاين" };
  const title = `${c.name} بالجملة | أسعار ${c.name} في العتبة أونلاين`;
  const description = `اشتري ${c.name} بسعر الجملة من تجار ومصانع العتبة. أسعار بالكمية، وتوصيل لكل محافظات مصر.`;
  return {
    title, description, alternates: { canonical: `${SITE}/c/${c.id}` },
    openGraph: { title, description, url: `${SITE}/c/${c.id}`, locale: "ar_EG", siteName: "العتبة أونلاين", images: c.image ? [sized(c.image, 1200)] : undefined },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { id } = await params;
  const [c, products] = await Promise.all([restCategory(id), restProducts({ cat: id, limit: 120 })]);
  if (!c) notFound();
  const list = [...products].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: c.name,
    itemListElement: list.slice(0, 50).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/product/${p.id}`, name: p.name, image: firstImage(p) ? sized(firstImage(p), 600) : undefined })),
  };
  return (
    <div className="wc">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <small><Link href="/">الرئيسية</Link> › <Link href="/categories">الأقسام</Link></small>
      <div className="row wrap mt" style={{ alignItems: "flex-end", marginBottom: 14 }}>
        <div className="sp">
          <h1 style={{ fontSize: 24 }}>{c.name} بالجملة</h1>
          <p className="mu" style={{ marginTop: 4 }}>{list.length} منتج{list.length ? ` · الأسعار تبدأ من ${Math.min(...list.map(minPrice).filter((x) => x > 0))} ج.م` : ""}</p>
        </div>
        <Link href={`/search?cat=${c.id}`} className="btn o sm2"><i className="ph ph-sliders-horizontal" />فلترة وترتيب</Link>
      </div>
      {list.length ? (
        <div className="grid" style={{ ["--m" as string]: 2, ["--d" as string]: 5 }}>{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      ) : <p className="mu">لسه مفيش منتجات في القسم ده.</p>}
    </div>
  );
}
