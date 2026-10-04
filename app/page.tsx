"use client";
import Link from "next/link";
import { st } from "@/lib/style";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { listActiveProducts, listApprovedMerchants, listCategories } from "@/lib/store";
import { Empty, Img, Loading, ProductCard } from "@/components/Ui";

const HOW = [
  { n: "1", t: "دوّر أو اطلب عرض سعر", d: "اختار المنتج أو اكتب طلبك وهيوصل لتجار مناسبين" },
  { n: "2", t: "قارن واتفق", d: "قارن الأسعار بالكمية وقارن عروض أكتر من تاجر" },
  { n: "3", t: "اطلب واستلم", d: "الطلب بيوصل للتاجر وبتتابع حالته من حسابك" },
];

export default function Home() {
  const { isAdmin } = useApp();
  const { data, loading } = useAsync(async () => {
    const [products, cats, merchants] = await Promise.all([listActiveProducts(), listCategories(), listApprovedMerchants()]);
    return { products, cats, merchants };
  });
  const verified = new Set((data?.merchants ?? []).filter((m) => m.verified).map((m) => m.id));
  const products = data?.products ?? [];
  return (
    <>
      <div className="hero">
        <div className="col" style={{ maxWidth: 820, margin: "auto", textAlign: "center", gap: 14 }}>
          <h1 style={{ color: "var(--pm)" }}>اشتري جملة من المصنع مباشرة</h1>
          <p className="mu" style={{ fontSize: 17 }}>أسعار بالكمية من مصانع وتجار جملة في مصر، وتقدر تطلب عرض سعر من أكتر من تاجر في طلب واحد.</p>
          <div className="row wrap g8" style={{ justifyContent: "center" }}>
            <Link href="/search" className="btn">تصفّح المنتجات</Link>
            <Link href="/rfq" className="btn o">اطلب عرض سعر</Link>
          </div>
        </div>
      </div>
      <div className="wc">
        {(data?.cats.length ?? 0) > 0 && (
          <div className="sec"><h2>الأقسام</h2>
            <div className="grid" style={st("--m:4;--d:8")}>
              {data!.cats.map((c) => (
                <Link key={c.id} href={`/search?cat=${c.id}`} className="cat"><span className="circ"><i className={`ph ${c.icon}`} /></span>{c.name}</Link>
              ))}
            </div>
          </div>
        )}
        <div className="sec">
          <div className="row"><h2 className="sp">أحدث المنتجات</h2>{products.length > 0 && <Link href="/search" style={{ color: "var(--pm)" }}>شوف الكل ←</Link>}</div>
          {loading ? <Loading /> : products.length ? (
            <div className="grid" style={st("--m:2;--d:4")}>{products.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} verified={verified.has(p.merchantId)} />)}</div>
          ) : (
            <Empty icon="ph-package" title="لسه مفيش منتجات منشورة" sub="المنتجات هتظهر هنا أول ما تتضاف وتتنشر.">
              {isAdmin ? <Link href="/admin/products" className="btn">أضف أول منتج</Link> : <Link href="/rfq" className="btn">اطلب عرض سعر</Link>}
            </Empty>
          )}
        </div>
        {(data?.merchants.length ?? 0) > 0 && (
          <div className="sec">
            <div className="row"><h2 className="sp">تجار على العتبة</h2><Link href="/suppliers" style={{ color: "var(--pm)" }}>شوف الكل ←</Link></div>
            <div className="scr">
              {data!.merchants.slice(0, 10).map((m) => (
                <Link key={m.id} href={`/store/${m.id}`} className="card row" style={{ minWidth: 270 }}>
                  <Img ic="ph-storefront" ratio={1} style={{ width: 56, borderRadius: 8 }} />
                  <div className="col g4"><b>{m.name}</b><small>{m.governorate} · {m.type}</small>{m.verified && <span className="bd v" style={{ alignSelf: "flex-start" }}><i className="ph ph-seal-check" />موثّق</span>}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="card row wrap" style={{ padding: 24, background: "var(--mint)", border: 0, marginBottom: 34 }}>
          <i className="ph ph-clipboard-text" style={{ fontSize: 44, color: "var(--pm)" }} />
          <div className="sp" style={{ minWidth: 220 }}><h2>مش لاقي اللي بتدور عليه؟</h2><p className="mu">اكتب طلبك والتجار يبعتولك أسعار.</p></div>
          <Link href="/rfq" className="btn">اطلب عرض سعر</Link>
        </div>
        <div className="sec"><h2>إزاي بتشتري من العتبة؟</h2>
          <div className="grid" style={st("--m:1;--d:3")}>
            {HOW.map((h) => (
              <div key={h.n} className="card row"><b style={{ font: "700 30px Alexandria", color: "var(--pa)" }}>{h.n}</b><div><b>{h.t}</b><p className="mu">{h.d}</p></div></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
