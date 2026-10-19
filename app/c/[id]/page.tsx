import type { Metadata } from "next";
import { childrenOf, productCats } from "@/lib/cats";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SITE, firstImage, minPrice, restCategory, restCategoryRes, restProducts } from "@/lib/fsrest";
import { sized } from "@/lib/media";
import { catalogOrNull } from "@/lib/catalog";
import type { Category, Product } from "@/lib/types";
import { ProductCard } from "@/components/Ui";

/* Category landing page rendered on the server, so Google sees the real product names and prices. */
export const revalidate = 3600;
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = (await catalogOrNull())?.categories.find((x) => x.id === id) || (await restCategory(id));
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
  // read from the cached catalogue (no Firebase reads per visit); fall back to direct reads only if it's unavailable
  const cat = await catalogOrNull();
  let c: Category | null = null, missing = false, products: Product[] = [];
  let subs: Category[] = [], parent: Category | null = null;
  if (cat) {
    c = cat.categories.find((x) => x.id === id) || null; missing = !c;
    // a main category shows the products of all its sub-categories
    products = cat.products.filter((p) => productCats(p, cat.categories).includes(id)).slice(0, 240);
    subs = childrenOf(cat.categories, id);
    parent = c?.parentId ? cat.categories.find((x) => x.id === c!.parentId) || null : null;
  } else {
    const [r, ps] = await Promise.all([restCategoryRes(id), restProducts({ cat: id, limit: 120 })]);
    c = r.c; missing = r.missing; products = ps;
  }
  if (!c) {
    if (missing) notFound();
    redirect(`/search?cat=${encodeURIComponent(id)}`); // server read failed for a moment → show the same products from the browser instead of a 404
  }
  const list = [...products].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: c.name,
    itemListElement: list.slice(0, 50).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/product/${p.id}`, name: p.name, image: firstImage(p) ? sized(firstImage(p), 600) : undefined })),
  };
  return (
    <div className="wc">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <small><Link href="/">الرئيسية</Link> › <Link href="/categories">الأقسام</Link>{parent && <> › <Link href={`/c/${parent.id}`}>{parent.name}</Link></>}</small>
      <div className="row wrap mt" style={{ alignItems: "flex-end", marginBottom: 14 }}>
        <div className="sp">
          <h1 style={{ fontSize: 24 }}>{c.name} بالجملة</h1>
          <p className="mu" style={{ marginTop: 4 }}>{list.length} منتج{list.length ? ` · الأسعار تبدأ من ${Math.min(...list.map(minPrice).filter((x) => x > 0))} ج.م` : ""}</p>
        </div>
        <Link href={`/search?cat=${c.id}`} className="btn o sm2"><i className="ph ph-sliders-horizontal" />فلترة وترتيب</Link>
      </div>
      {subs.length > 0 && (
        <div className="scr" style={{ gap: 8, marginBottom: 14 }}>
          {subs.map((s) => <Link key={s.id} href={`/c/${s.id}`} className="chip" style={{ minHeight: 34 }}>{s.name}</Link>)}
        </div>
      )}
      {list.length ? (
        <div className="grid" style={{ ["--m" as string]: 2, ["--d" as string]: 5 }}>{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      ) : <p className="mu">لسه مفيش منتجات في القسم ده.</p>}
    </div>
  );
}
