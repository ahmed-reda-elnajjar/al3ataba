"use client";
import Link from "next/link";
import { st } from "@/lib/style";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { listActiveProducts, listApprovedMerchants, listCategories } from "@/lib/store";
import { Empty, Img, Loading, ProductCard } from "@/components/Ui";
import { Skyline } from "@/components/Brand";

export default function Home() {
  const { isAdmin, settings } = useApp();
  const { data, loading } = useAsync(async () => {
    const [products, cats, merchants] = await Promise.all([listActiveProducts(), listCategories(), listApprovedMerchants()]);
    return { products, cats, merchants };
  });
  const verified = new Set((data?.merchants ?? []).filter((m) => m.verified).map((m) => m.id));
  const products = data?.products ?? [];
  const cats = data?.cats ?? [];
  return (
    <div className="wc">
      {/* hero banner */}
      <section className="hero2" style={{ marginBottom: 20 }}>
        {settings.heroImage ? <img className="bg" src={settings.heroImage} alt="" /> : <Skyline className="sky" />}
        <div className="sh" />
        <div className="tx">
          <h1>{settings.heroTitle || "منتجات الجملة بأسعار حقيقية"}</h1>
          <p>{settings.heroSub || "من كل أسواق مصر .. في مكان واحد"}</p>
          <Link href="/search" className="btn gd sm2" style={{ minHeight: 42, padding: "0 22px" }}>تسوق الآن</Link>
        </div>
      </section>

      {/* category circles */}
      {cats.length > 0 && (
        <div className="scr" style={{ gap: 14, marginBottom: 22 }}>
          {cats.map((c) => (
            <Link key={c.id} href={`/search?cat=${c.id}`} className="cat">
              <span className="circ">{c.image ? <img src={c.image} alt="" /> : <i className={`ph ${c.icon}`} />}</span>{c.name}
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
                <Img src={c.image} ic={c.icon} ratio={1} />
                <span>{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

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
