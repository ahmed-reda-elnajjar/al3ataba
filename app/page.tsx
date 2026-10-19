"use client";
import { topCats } from "@/lib/cats";
import { useMemo, useState } from "react";
import Link from "next/link";
import { st } from "@/lib/style";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { listApprovedMerchants, listCategories, newArrivalsMixed, pageActiveProducts, type Cursor } from "@/lib/store";
import type { Product } from "@/lib/types";
import { Empty, Img, Loading, ProductCard } from "@/components/Ui";
import { Recommended } from "@/components/Recommend";
import { HeroSlider, usePersonalCats } from "@/components/Promos";
import { Rail } from "@/components/Rail";

const EMPTY: never[] = [];

export default function Home() {
  const { isAdmin } = useApp();
  const { data, loading } = useAsync(async () => {
    const [cats, merchants] = await Promise.all([listCategories(), listApprovedMerchants().catch(() => [])]);
    const products = await newArrivalsMixed(10, cats.map((c) => c.id));
    return { products, cats, merchants };
  });
  // "more products": next pages of the newest products (from the cached catalogue — no extra Firebase reads)
  const [more, setMore] = useState<{ items: Product[]; cursor: Cursor; has: boolean; busy: boolean }>({ items: [], cursor: null, has: true, busy: false });
  const loadMore = async () => {
    setMore((m) => ({ ...m, busy: true }));
    try {
      const r = await pageActiveProducts(20, { after: more.cursor });
      setMore((m) => { const seen = new Set(m.items.map((x) => x.id)); return { items: [...m.items, ...r.items.filter((x) => !seen.has(x.id))], cursor: r.cursor, has: r.more && r.items.length > 0, busy: false }; });
    } catch { setMore((m) => ({ ...m, busy: false })); }
  };
  const verified = new Set((data?.merchants ?? []).filter((m) => m.verified).map((m) => m.id));
  const products = data?.products ?? [];
  // main categories first, then sub-categories ordered for this shopper (offers → what they browse/buy most)
  const tops = useMemo(() => topCats(data?.cats ?? EMPTY), [data]);
  const subs = useMemo(() => { const ids = new Set(tops.map((t) => t.id)); return (data?.cats ?? EMPTY).filter((c) => !ids.has(c.id)); }, [data, tops]);
  const { list: mains, offers } = usePersonalCats(tops);
  const { list: subList, offers: subOffers } = usePersonalCats(subs);
  const cats = useMemo(() => [...mains, ...subList.slice(0, 16)], [mains, subList]);
  const hasOffer = (id: string) => offers.has(id) || subOffers.has(id);
  return (
    <div className="wc">
      <HeroSlider />

      {/* main categories grid */}
      {cats.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>أقسام رئيسية</h2><Link href="/categories">عرض الكل</Link></div>
          <Rail auto={2800}>
            {cats.map((c) => (
              <Link key={c.id} href={`/c/${c.id}`} className="tile short">
                <Img src={c.image} ic={c.icon} ratio={4 / 3} w={300} />
                {hasOffer(c.id) && <span className="pbadge"><i className="ph-fill ph-tag" />عرض</span>}
                <span>{c.name}</span>
              </Link>
            ))}
          </Rail>
        </section>
      )}

      <Recommended />

      {/* products */}
      <section className="sec">
        <div className="sec-h"><h2>وصل حديثاً</h2>{products.length > 0 && <Link href="/search">عرض الكل</Link>}</div>
        {loading ? <Loading /> : products.length ? (
          <>
            <div className="grid" style={st("--m:2;--d:5")}>{[...products.slice(0, 10), ...more.items.filter((x) => !products.slice(0, 10).some((p) => p.id === x.id))].map((p) => <ProductCard key={p.id} p={p} verified={verified.has(p.merchantId)} />)}</div>
            {more.has && <div className="c mt2"><button className="btn o" disabled={more.busy} onClick={loadMore}>{more.busy ? "جاري التحميل…" : <><i className="ph ph-caret-down" />منتجات أكتر</>}</button></div>}
          </>
        ) : (
          <Empty icon="ph-package" title="لسه مفيش منتجات منشورة" sub="المنتجات هتظهر هنا أول ما تتضاف.">
            {isAdmin ? <Link href="/admin/products/new" className="btn">أضف أول منتج</Link> : null}
          </Empty>
        )}
      </section>

      {/* stores */}
      {(data?.merchants.length ?? 0) > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>متاجر الجملة</h2><Link href="/suppliers">عرض الكل</Link></div>
          <div className="scr">
            {data!.merchants.slice(0, 10).map((m) => (
              <Link key={m.id} href={`/store/${m.id}`} className="card row" style={{ minWidth: 250 }}>
                <span className="mi" style={{ width: 52, height: 52, borderRadius: 14, background: "var(--cream)", display: "grid", placeItems: "center", color: "var(--pm)", flex: "none" }}><i className="ph ph-storefront" style={{ fontSize: 28 }} /></span>
                <div className="col g4" style={{ minWidth: 0 }}><b>{m.name}</b><small>{m.governorate} · {m.type}</small>{m.verified && <span className="bd v" style={{ alignSelf: "flex-start" }}><i className="ph ph-seal-check" />موثّق</span>}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
