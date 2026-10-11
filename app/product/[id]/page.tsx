"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { st } from "@/lib/style";
import { fmt } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { priceFor, sortTiers } from "@/lib/pricing";
import { useApp } from "@/lib/providers";
import { getMerchant, getProduct, sampleCategory } from "@/lib/store";
import { Empty, Img, Loading, ProductCard } from "@/components/Ui";
import { HOUSE } from "@/lib/config";
import { useFavs } from "@/lib/favs";
import { Gallery } from "@/components/Gallery";
import { Recommended } from "@/components/Recommend";
import { track } from "@/lib/reco";
import { swatch } from "@/lib/colors";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { add, items, isAdmin, withPromo } = useApp();
  const { data, loading } = useAsync(async () => {
    const p = await getProduct(id);
    if (!p) return null;
    const [merchant, similar] = await Promise.all([p.merchantId === HOUSE.id ? null : getMerchant(p.merchantId), sampleCategory(p.categoryId, 4, p.id).catch(() => [])]);
    return { p, merchant, similar };
  }, [id]);
  const p = data?.p ? withPromo(data.p) : undefined;
  const favs = useFavs();
  const [qty, setQty] = useState(0);
  const [color, setColor] = useState("");
  useEffect(() => { if (data?.p) { setQty(data.p.moq); setColor(data.p.colors?.[0] || ""); } }, [data?.p]);
  useEffect(() => { if (data?.p) track("view", data.p); }, [data?.p]);
  useEffect(() => { if (data?.p) document.title = `${data.p.name} | العتبة`; }, [data?.p]);

  if (loading) return <div className="wc"><Loading rows={2} /></div>;
  if (!p) return <div className="wc"><Empty icon="ph-package" title="المنتج مش موجود أو اتشال"><Link href="/search" className="btn">تصفّح المنتجات</Link></Empty></div>;

  const price = priceFor(p.tiers, qty || p.moq);
  const q = Math.max(qty || p.moq, p.moq);
  const cartId = color ? `${p.id}:${color}` : p.id;
  const inCart = items.some((i) => i.id === cartId);
  const addToCart = () => {
    track("cart", p);
    add({ id: cartId, productId: p.id, name: color ? `${p.name} (${color})` : p.name, merchantId: p.merchantId, merchant: p.merchantName, qty: q, price: priceFor(p.tiers, q), image: p.images?.[0], unit: p.unit, moq: p.moq, tiers: p.tiers, cod: p.cod, ...(p.promo ? { promo: p.promo.label } : {}) });
    router.push("/cart");
  };
  const tiers = sortTiers(p.tiers);
  const verified = !!data?.merchant?.verified;
  return (
    <div className="wc">
      {isAdmin && <div className="alert row wrap" style={{ marginBottom: 12 }}><b className="sp">أدمن</b><Link className="btn o sm2" href={`/admin/products/${p.id}`}>تعديل المنتج</Link><Link className="btn sm2" href="/admin/products/new">+ منتج جديد</Link></div>}
      <small><Link href="/">الرئيسية</Link> › <Link href={`/search?cat=${p.categoryId}`}>{p.categoryName}</Link></small>
      <div className="grid mt" style={st("--m:1;--d:2;align-items:start;gap:28px")}>
        <Gallery images={p.images ?? []} videos={p.videos ?? []} order={p.media}>
          <button className={`ico${favs.has(p.id) ? " on" : ""}`} style={{ position: "absolute", top: 12, insetInlineEnd: 12, zIndex: 3, width: 42, height: 42 }} onClick={() => { if (!favs.has(p.id)) track("fav", p); favs.toggle(p.id); }} aria-label="المفضلة"><i className={`ph${favs.has(p.id) ? "-fill" : ""} ph-heart`} /></button>
        </Gallery>
        <div className="col">
          <div className="row g8 wrap">
            {p.madeInEgypt && <span className="bd">صنع في مصر</span>}{p.cod && <span className="bd">يقبل الدفع عند الاستلام</span>}{p.logoPrint && <span className="bd">طباعة لوجو</span>}
          </div>
          <h1 style={{ fontSize: 24 }}>{p.name}</h1>
          {p.promo && <Link href={`/offers?id=${p.promo.id}`} className="promo-line" style={p.promo.color ? { background: p.promo.color } : undefined}><i className="ph-fill ph-tag" /><b>{p.promo.label}</b><span className="sp">{p.promo.title}</span><i className="ph ph-caret-left" /></Link>}
          {(p.packSize ?? 0) > 1 && <div className="alert row g8" style={{ padding: "8px 12px" }}><i className="ph ph-stack" style={{ color: "var(--gold)" }} /><span>بيتباع <b>{p.unit} كاملة</b> فيها <b>{p.packSize} قطعة</b> · سعر القطعة ≈ <b>{fmt(price / (p.packSize as number))} ج.م</b></span></div>}
          <div className="row" style={{ alignItems: "baseline" }}><span className="price" style={{ fontSize: 28 }}>{fmt(price)} <small>ج.م / {p.unit}{(p.packSize ?? 0) > 1 ? ` (${p.packSize} قطعة)` : ""}</small></span>{p.origTiers && <s className="was" style={{ fontSize: 18 }}>{fmt(priceFor(p.origTiers, qty || p.moq))}</s>}{tiers.length > 1 && <span className="old" style={{ textDecoration: "none" }}>من {fmt(tiers[tiers.length - 1].price)} لـ {fmt(tiers[0].price)} حسب الكمية</span>}</div>
          {tiers.length > 1 ? (
            <div className="card z"><table className="tbl"><tbody>
              <tr><th>الكمية</th><th>سعر ال{p.unit}</th><th>التوفير</th></tr>
              {tiers.map((t, i) => {
                const next = tiers[i + 1];
                const on = q >= t.min && (!next || q < next.min);
                const save = tiers[0].price > t.price ? Math.round((1 - t.price / tiers[0].price) * 100) : 0;
                return (
                  <tr key={t.min} className={on ? "hl" : ""} style={{ cursor: "pointer" }} onClick={() => setQty(Math.max(t.min, p.moq))}>
                    <td>{next ? (next.min - 1 === t.min ? `${t.min} ${p.unit}` : `من ${t.min} لـ ${next.min - 1} ${p.unit}`) : `${t.min} ${p.unit} أو أكتر`}</td>
                    <td><b>{fmt(t.price)} ج.م</b></td>
                    <td>{save ? <span className="bd v">وفّر {save}%</span> : <small>—</small>}</td>
                  </tr>
                );
              })}
            </tbody></table></div>
          ) : (
            <div className="alert">سعر ال{p.unit}: <b>{fmt(tiers[0]?.price ?? 0)} ج.م</b> · أقل طلب {p.moq} {p.unit}</div>
          )}
          {p.colors?.length > 0 && <div className="col g8"><b>اختار اللون: <span style={{ color: "var(--gold)" }}>{color}</span></b><div className="row g8 wrap">{p.colors.map((c) => <button type="button" key={c} className={`chip${c === color ? " on" : ""}`} onClick={() => setColor(c)}><span className="sw" style={{ background: swatch(c) || "var(--cream)" }} />{c}</button>)}</div></div>}
          {tiers.length > 1 && <small>أقل طلب: {p.moq} {p.unit} · اضغط على أي سطر في الجدول علشان تختار الكمية دي</small>}
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
      <div className="mt2"><Recommended title="ممكن يعجبك كمان" exclude={[p.id, ...(data?.similar ?? []).map((x) => x.id)]} boostCat={p.categoryId} n={8} cols={4} /></div>
    </div>
  );
}
