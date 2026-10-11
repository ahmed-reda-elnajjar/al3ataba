"use client";
import { sized } from "@/lib/media";
import Link from "next/link";
import { useState } from "react";
import { collection, deleteDoc, doc, getDocs, limit, query, updateDoc, writeBatch } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { ms } from "@/lib/format";
import { Empty, Status } from "@/components/Ui";
import { rangeText, tiersFromMarkup, type MarkupTier } from "@/lib/pricing";
import { MarkupEditor } from "@/components/Markup";
import type { Product } from "@/lib/types";

export default function AdminProducts() {
  const { data, loading, reload } = useAsync(async () => {
    const s = await getDocs(query(collection(dbI(), "products"), limit(500)));
    return s.docs.map((d) => withId<Product>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }, []);
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const set = async (p: Product, status: string) => { await updateDoc(doc(dbI(), "products", p.id), { status }); reload(); };
  const del = async (p: Product) => { if (confirm(`حذف "${p.name}" نهائيًا؟`)) { await deleteDoc(doc(dbI(), "products", p.id)); reload(); } };
  const [who, setWho] = useState("");
  const [mt, setMt] = useState<MarkupTier[]>([{ min: 1, pct: 10 }, { min: 5, pct: 5 }]);
  const [mmsg, setMmsg] = useState("");
  const merchants = Array.from(new Map((data ?? []).map((p) => [p.merchantId, p.merchantName])).entries());
  // Applies the markup on top of each product's ORIGINAL price (saved the first time), so applying it twice never stacks.
  const applyMarkup = async () => {
    const target = (data ?? []).filter((p) => who === "all" || p.merchantId === who);
    const good = mt.filter((x) => x.min > 0);
    if (!who || !good.length || !target.length) return setMmsg("اختار التاجر وحدد الشرايح.");
    if (!confirm(`هتتغيّر أسعار ${target.length} منتج حسب الشرايح (${good.map((x) => `من ${x.min}: +${x.pct}%`).join("، ")}) محسوبة على السعر الأصلي. متأكد؟`)) return;
    let b = writeBatch(dbI()), k = 0;
    for (const p of target) {
      // original price = saved base, or (first time) today's price for the smallest quantity
      const base = p.basePrices?.[0] ?? [...p.tiers].sort((x, y) => x.min - y.min)[0]?.price ?? 0;
      if (!(base > 0)) continue;
      const tiers = tiersFromMarkup(base, good);
      b.update(doc(dbI(), "products", p.id), { basePrices: [base], markup: null, markupTiers: good, tiers, moq: tiers[0].min });
      if (++k % 400 === 0) { await b.commit(); b = writeBatch(dbI()); }
    }
    await b.commit();
    setMmsg(`تم تحديث ${target.length} منتج.`); reload();
  };
  const list = (data ?? []).filter((p) => (f === "all" || p.status === f) && (!q || p.name.includes(q)));
  return (
    <>
      <div className="row wrap"><b className="sp" style={{ fontSize: 18 }}>المنتجات ({data?.length ?? 0})</b><Link className="btn" href="/admin/products/new">+ إضافة منتج</Link></div>
      <div className="row wrap">
        {[["all", "الكل"], ["active", "منشور"], ["pending", "قيد المراجعة"], ["hidden", "مخفي"]].map(([k, t]) => <button key={k} className={`chip ${f === k ? "on" : ""}`} onClick={() => setF(k)}>{t}</button>)}
        <input className="in" style={{ maxWidth: 220 }} placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>زيادة / تعديل الأسعار بنسبة %</summary>
        <div className="col" style={{ marginTop: 12 }}>
          <small>النسب بتتحسب دايماً على السعر الأصلي للمنتج (قبل أي زيادة)، فتطبيقها أكتر من مرة مش بيزوّد السعر مرتين. شريحة واحدة "من 1 قطعة: 0%" بترجّع السعر الأصلي.</small>
          <div className="row wrap">
            <select className="in" style={{ maxWidth: 260 }} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">اختار التاجر…</option><option value="all">كل المنتجات</option>
              {merchants.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </div>
          <MarkupEditor value={mt} onChange={setMt} />
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={applyMarkup}>تطبيق على منتجات التاجر</button>
          {mmsg && <span className="ok">{mmsg}</span>}
        </div>
      </details>
      {loading ? <div className="skel" /> : !list.length ? <Empty icon="ph-package" title="مفيش منتجات" sub="ابدأ بإضافة أول منتج." /> : (
        <div className="col">
          {list.map((p) => (
            <div key={p.id} className="card row wrap">
              {p.images?.[0] ? <img className="ph-thumb" src={sized(p.images[0], 120)} alt="" loading="lazy" /> : <div className="ph-thumb" />}
              <div className="sp" style={{ minWidth: 160 }}><b>{p.name}</b><br /><small>{p.merchantName} · {p.categoryName} · {rangeText(p)} ج.م{p.markupTiers?.length ? ` (${p.markupTiers.map((x) => `${x.min}+: ${x.pct}%`).join(" / ")})` : p.markup ? ` (+${p.markup}%)` : ""}</small></div>
              <Status s={p.status} />
              <Link className="btn o sm2" href={`/admin/products/${p.id}`}>تعديل</Link>
              {p.status !== "active" ? <button className="btn sm2" onClick={() => set(p, "active")}>نشر</button> : <button className="btn o sm2" onClick={() => set(p, "hidden")}>إخفاء</button>}
              <button className="btn r sm2" onClick={() => del(p)}>حذف</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
