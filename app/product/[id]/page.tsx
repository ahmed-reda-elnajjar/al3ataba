"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { st } from "@/lib/style";
import { fmt } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { priceFor, sortTiers } from "@/lib/pricing";
import { useApp } from "@/lib/providers";
import { getMerchant, getProduct, listActiveProducts } from "@/lib/store";
import { Empty, Img, Loading, ProductCard } from "@/components/Ui";
import { HOUSE } from "@/lib/config";
import { useFavs } from "@/lib/favs";
import { swatch } from "@/lib/colors";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { add, items, isAdmin } = useApp();
  const { data, loading } = useAsync(async () => {
    const p = await getProduct(id);
    if (!p) return null;
    const [merchant, all] = await Promise.all([p.merchantId === HOUSE.id ? null : getMerchant(p.merchantId), listActiveProducts()]);
    return { p, merchant, similar: all.filter((x) => x.id !== p.id && x.categoryId === p.categoryId).slice(0, 4) };
  }, [id]);
  const p = data?.p;
  const favs = useFavs();
  const [qty, setQty] = useState(0);
  const [color, setColor] = useState("");
  const [img, setImg] = useState(0);
  useEffect(() => { if (p) { setQty(p.moq); setColor(p.colors?.[0] || ""); setImg(0); } }, [p]);
  useEffect(() => { if (p) document.title = `${p.name} | العتبة`; }, [p]);

  if (loading) return <div className="wc"><Loading rows={2} /></div>;
  if (!p) return <div className="wc"><Empty icon="ph-package" title="المنتج مش موجود أو اتشال"><Link href="/search" className="btn">تصفّح المنتجات</Link></Empty></div>;

  const price = priceFor(p.tiers, qty || p.moq);
  const q = Math.max(qty || p.moq, p.moq);
  const cartId = color ? `${p.id}:${color}` : p.id;
  const inCart = items.some((i) => i.id === cartId);
  const addToCart = () => {
    add({ id: cartId, productId: p.id, name: color ? `${p.name} (${color})` : p.name, merchantId: p.merchantId, merchant: p.merchantName, qty: q, price: priceFor(p.tiers, q), image: p.images?.[0], unit: p.unit, moq: p.moq, tiers: p.tiers, cod: p.cod });
    router.push("/cart");
  };
  const tiers = sortTiers(p.tiers);
  const verified = !!data?.merchant?.verified;
  return (
    <div className="wc">
      {isAdmin && <div className="alert row wrap" style={{ marginBottom: 12 }}><b className="sp">أدمن</b><Link className="btn o sm2" href={`/admin/products/${p.id}`}>تعديل المنتج</Link><Link className="btn sm2" href="/admin/products/new">+ منتج جديد</Link></div>}
      <small><Link href="/">الرئيسية</Link> › <Link href={`/search?cat=${p.categoryId}`}>{p.categoryName}</Link></small>
      <div className="grid mt" style={st("--m:1;--d:2;align-items:start;gap:28px")}>
        <div style={{ position: "relative" }}>
          <button className={`ico${favs.has(p.id) ? " on" : ""}`} style={{ position: "absolute", top: 12, insetInlineEnd: 12, zIndex: 2, width: 42, height: 42 }} onClick={() => favs.toggle(p.id)} aria-label="المفضلة"><i className={`ph${favs.has(p.id) ? "-fill" : ""} ph-heart`} /></button>
          <Img src={p.images?.[img]} ic="ph-package" ratio={1} style={{ background: "#fff", border: "1px solid var(--bd)" }} />
          {p.images?.length > 1 && <div className="dots" style={{ marginTop: 10 }}>{p.images.map((_, i) => <i key={i} className={i === img ? "on" : ""} style={{ background: i === img ? "var(--gold)" : "var(--bd)" }} />)}</div>}
          {p.images?.length > 1 && <div className="gal">{p.images.map((s, i) => <button key={i} className={i === img ? "on" : ""} onClick={() => setImg(i)}><Img src={s} ratio={1} /></button>)}</div>}
        </div>
        <div className="col">
          <div className="row g8 wrap">
            {p.madeInEgypt && <span className="bd">صنع في مصر</span>}{p.cod && <span className="bd">يقبل الدفع عند الاستلام</span>}{p.logoPrint && <span className="bd">طباعة لوجو</span>}
          </div>
          <h1 style={{ fontSize: 24 }}>{p.name}</h1>
          <div className="row" style={{ alignItems: "baseline" }}><span className="price" style={{ fontSize: 28 }}>{fmt(price)} <small>ج.م / {p.unit}</small></span>{tiers.length > 1 && <span className="old" style={{ textDecoration: "none" }}>من {fmt(tiers[tiers.length - 1].price)} لـ {fmt(tiers[0].price)} حسب الكمية</span>}</div>
          <div className="card z"><table className="tbl"><tbody>
            <tr><th>الكمية ({p.unit})</th><th>السعر / {p.unit}</th></tr>
            {tiers.map((t, i) => { const next = tiers[i + 1]; const on = price === t.price && q >= t.min && (!next || q < next.min); return <tr key={t.min} className={on ? "hl" : ""}><td>{next ? `${t.min} – ${next.min - 1}` : `${t.min} +`}</td><td>{fmt(t.price)} ج.م</td></tr>; })}
          </tbody></table></div>
          {p.colors?.length > 0 && <div className="col g8"><b>اختار اللون: <span style={{ color: "var(--gold)" }}>{color}</span></b><div className="row g8 wrap">{p.colors.map((c) => <button type="button" key={c} className={`chip${c === color ? " on" : ""}`} onClick={() => setColor(c)}><span className="sw" style={{ background: swatch(c) || "var(--cream)" }} />{c}</button>)}</div></div>}
          <small>أقل طلب: {p.moq} {p.unit}</small>
          <div className="row">
            <div className="qty">
              <button aria-label="أكثر" onClick={() => setQty(q + Math.max(1, Math.round(p.moq / 2)))}><i className="ph ph-plus" /></button>
              <input inputMode="numeric" value={qty || ""} onChange={(e) => setQty(Number(e.target.value.replace(/\D/g, "")))} onBlur={() => setQty(q)} aria-label="الكمية" />
              <button aria-label="أقل" onClick={() => setQty(Math.max(p.moq, q - Math.max(1, Math.round(p.moq / 2))))}><i className="ph ph-minus" /></button>
            </div>
            <div className="sp"><small>الإجمالي</small><div className="price" style={{ fontSize: 24 }}>{fmt(q * price)} ج.م</div></div>
          </div>
          <button className="btn blk" onClick={addToCart}><i className="ph ph-shopping-cart" />{inCart ? "تحديث السلة" : "أضف إلى السلة"}</button>
          <Link href={`/rfq?product=${encodeURIComponent(p.name)}&cat=${p.categoryId}`} className="btn o blk">اطلب عرض سعر لكمية أكبر</Link>
          <b style={{ marginTop: 6 }}>معلومات التاجر</b>
          <Link href={`/store/${p.merchantId}`} className="card row">
            <Img ic="ph-storefront" ratio={1} style={{ width: 56, borderRadius: 12 }} />
            <div className="sp"><b>{p.merchantName}</b><div className="row g4 wrap">{verified && <span className="bd v"><i className="ph ph-seal-check" />موثّق</span>}{data?.merchant && <span className="bd g">{data.merchant.type}</span>}</div><small>{p.governorate}</small></div>
            <span className="btn o sm2">زيارة المتجر</span>
          </Link>
        </div>
      </div>
      <div className="grid mt2" style={st("--m:1;--d:2")}>
        {p.description && <div className="card col"><h3>الوصف</h3><p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p></div>}
        {p.specs?.length > 0 && <div className="card col"><h3>المواصفات</h3><table className="tbl"><tbody>{p.specs.map((s, i) => <tr key={i}><td>{s.k}</td><td>{s.v}</td></tr>)}</tbody></table></div>}
      </div>
      {(data?.similar.length ?? 0) > 0 && <div className="sec mt2"><h2>منتجات مشابهة</h2><div className="grid" style={st("--m:2;--d:4")}>{data!.similar.map((x) => <ProductCard key={x.id} p={x} />)}</div></div>}
    </div>
  );
}
