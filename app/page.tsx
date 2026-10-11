"use client";
import Link from "next/link";
import { st } from "@/lib/style";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { listApprovedMerchants, listCategories, newArrivalsMixed } from "@/lib/store";
import { Empty, Img, Loading, ProductCard } from "@/components/Ui";
import { Skyline } from "@/components/Brand";
import { Recommended } from "@/components/Recommend";
import { HeroSlider, usePersonalCats } from "@/components/Promos";
import { sized } from "@/lib/media";

const EMPTY: never[] = [];

export default function Home() {
  const { isAdmin } = useApp();
  const { data, loading } = useAsync(async () => {
    const [cats, merchants] = await Promise.all([listCategories(), listApprovedMerchants().catch(() => [])]);
    const products = await newArrivalsMixed(10, cats.map((c) => c.id));
    return { products, cats, merchants };
  });
  const verified = new Set((data?.merchants ?? []).filter((m) => m.verified).map((m) => m.id));
  const products = data?.products ?? [];
  const { list: cats, offers } = usePersonalCats(data?.cats ?? EMPTY);
  return (
    <div className="wc">
      <HeroSlider />

      {/* category circles */}
      {cats.length > 0 && (
        <div className="scr" style={{ gap: 14, marginBottom: 22 }}>
          {cats.map((c) => (
            <Link key={c.id} href={`/search?cat=${c.id}`} className="cat">
              <span className="circ">{c.image ? <img src={sized(c.image, 160)} alt="" loading="lazy" /> : <i className={`ph ${c.icon}`} />}{offers.has(c.id) && <span className="cbadge">عرض</span>}</span>{c.name}
            </Link>
          ))}
        </div>
      )}

      {/* main categories grid */}
      {cats.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>أقسام رئيسية</h2><Link href="/categories">عرض الكل</Link></div>
          <div className="grid" style={st("--m:3;--d:6")}>
            {cats.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/search?cat=${c.id}`} className="tile">
                <Img src={c.image} ic={c.icon} ratio={1} w={300} />
                {offers.has(c.id) && <span className="pbadge"><i className="ph-fill ph-tag" />عرض</span>}
                <span>{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Recommended />

      {/* products */}
      <section className="sec">
        <div className="sec-h"><h2>وصل حديثاً</h2>{products.length > 0 && <Link href="/search">عرض الكل</Link>}</div>
        {loading ? <Loading /> : products.length ? (
          <div className="grid" style={st("--m:2;--d:5")}>{products.slice(0, 10).map((p) => <ProductCard key={p.id} p={p} verified={verified.has(p.merchantId)} />)}</div>
        ) : (
          <Empty icon="ph-package" title="لسه مفيش منتجات منشورة" sub="المنتجات هتظهر هنا أول ما تتضاف.">
            {isAdmin ? <Link href="/admin/products/new" className="btn">أضف أول منتج</Link> : <Link href="/rfq" className="btn">اطلب منتج</Link>}
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

      {/* RFQ banner */}
      <section className="dash" style={{ marginBottom: 28 }}>
        <Skyline className="sky" style={{ position: "absolute", bottom: 0, left: 0, width: "55%", opacity: 0.18, color: "var(--gold2)" }} />
        <div className="row wrap" style={{ position: "relative" }}>
          <div className="sp" style={{ minWidth: 220 }}>
            <h2>مش لاقي اللي بتدور عليه؟</h2>
            <small>اطلب المنتج بالكمية اللي محتاجها والتجار يبعتولك أسعارهم.</small>
          </div>
          <Link href="/rfq" className="btn gd">اطلب منتج</Link>
        </div>
      </section>
    </div>
  );
}
