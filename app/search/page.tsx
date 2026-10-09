"use client";
import { Suspense, useEffect, useMemo, useState } from "react";

const PAGE = 24;
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { st } from "@/lib/style";
import { GOVERNORATES } from "@/lib/config";
import { useAsync } from "@/lib/hooks";
import { priceRange } from "@/lib/pricing";
import { allActiveProductsCached, listApprovedMerchants, listCategories, pageActiveProducts, type Page } from "@/lib/store";
import { norm } from "@/components/SearchBox";
import type { Product } from "@/lib/types";
import { Empty, Loading, ProductCard } from "@/components/Ui";

function Results() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = (sp.get("q") || "").trim();
  const cat = sp.get("cat") || "";
  const [gov, setGov] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [moq, setMoq] = useState("");
  const [vOnly, setV] = useState(false);
  const [cod, setCod] = useState(false);
  const [mie, setMie] = useState(false);
  const [logo, setLogo] = useState(false);
  const [sort, setSort] = useState("new");
  const [showF, setShowF] = useState(false);
  const { data } = useAsync(async () => {
    const [cats, merchants] = await Promise.all([listCategories(), listApprovedMerchants()]);
    return { cats, verified: new Set(merchants.filter((m) => m.verified).map((m) => m.id)) };
  });
  // Browsing (no text): 24 newest at a time. Text search: the cached catalogue (loaded once per visit).
  const [items, setItems] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<Page["cursor"]>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyMore, setBusyMore] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true); setItems([]);
    (q ? allActiveProductsCached().then((all) => ({ items: all, cursor: null, more: false } as Page)) : pageActiveProducts(PAGE, { cat }))
      .then((r) => { if (!live) return; setItems(r.items); setCursor(r.cursor); setMore(r.more); setLoading(false); })
      .catch(() => live && setLoading(false));
    return () => { live = false; };
  }, [q, cat]);
  const loadMore = async () => {
    setBusyMore(true);
    try { const r = await pageActiveProducts(PAGE, { cat, after: cursor }); setItems((x) => [...x, ...r.items]); setCursor(r.cursor); setMore(r.more); } finally { setBusyMore(false); }
  };

  const list = useMemo(() => {
    const terms = norm(q).split(" ").filter(Boolean);
    let a = items.filter((p) => {
      const hay = norm(`${p.name} ${p.description} ${p.categoryName} ${p.merchantName} ${(p.keywords || []).join(" ")}`);
      if (terms.some((t) => !hay.includes(t))) return false;
      if (cat && p.categoryId !== cat) return false;
      if (gov && p.governorate !== gov) return false;
      const [lo, hi] = priceRange(p);
      if (min && hi < Number(min)) return false;
      if (max && lo > Number(max)) return false;
      if (moq && p.moq > Number(moq)) return false;
      if (vOnly && !data?.verified.has(p.merchantId)) return false;
      if (cod && !p.cod) return false;
      if (mie && !p.madeInEgypt) return false;
      if (logo && !p.logoPrint) return false;
      return true;
    });
    if (sort === "cheap") a = [...a].sort((x, y) => priceRange(x)[0] - priceRange(y)[0]);
    if (sort === "moq") a = [...a].sort((x, y) => x.moq - y.moq);
    if (sort === "high") a = [...a].sort((x, y) => priceRange(y)[1] - priceRange(x)[1]);
    return a;
  }, [items, data, q, cat, gov, min, max, moq, vOnly, cod, mie, logo, sort]);

  const catName = data?.cats.find((c) => c.id === cat)?.name;
  const filters = (
    <div className="col" style={{ gap: 14 }}>
      <div className="fld"><label>القسم</label>
        <select className="in" value={cat} onChange={(e) => router.push(`/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(e.target.value ? { cat: e.target.value } : {}) })}`)}>
          <option value="">كل الأقسام</option>{data?.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div className="fld"><label>السعر (ج.م)</label><div className="row"><input className="in" inputMode="numeric" placeholder="من" value={min} onChange={(e) => setMin(e.target.value)} /><input className="in" inputMode="numeric" placeholder="إلى" value={max} onChange={(e) => setMax(e.target.value)} /></div></div>
      <div className="fld"><label>أقصى حد أدنى للطلب</label><input className="in" inputMode="numeric" placeholder="مثال: 100" value={moq} onChange={(e) => setMoq(e.target.value)} /></div>
      <div className="fld"><label>المحافظة</label><select className="in" value={gov} onChange={(e) => setGov(e.target.value)}><option value="">كل المحافظات</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
      <label className="chk"><input type="checkbox" checked={vOnly} onChange={(e) => setV(e.target.checked)} />تاجر موثّق فقط</label>
      <label className="chk"><input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} />الدفع عند الاستلام</label>
      <label className="chk"><input type="checkbox" checked={mie} onChange={(e) => setMie(e.target.checked)} />صنع في مصر</label>
      <label className="chk"><input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} />طباعة لوجو</label>
    </div>
  );

  const go = (c: string) => router.push(`/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(c ? { cat: c } : {}) })}`);
  return (
    <div className="wc">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="sp"><h1 style={{ fontSize: 22 }}>{q ? `نتائج: ${q}` : catName || "كل المنتجات"}</h1><small>{loading ? "…" : `${list.length}${more ? "+" : ""} منتج`}</small></div>
        <button className={`ico sm${showF ? " on" : ""}`} style={{ width: 44, height: 44, borderRadius: 12 }} onClick={() => setShowF(!showF)} aria-label="فلترة"><i className="ph ph-funnel" /></button>
      </div>
      <div className="scr" style={{ marginBottom: 8 }}>
        {[["new", "كل المنتجات"], ["cheap", "الأقل سعراً"], ["high", "الأعلى سعراً"], ["moq", "أقل كمية"]].map(([k, t]) => <button key={k} className={`chip${sort === k ? " on" : ""}`} onClick={() => setSort(k)}>{t}</button>)}
      </div>
      {(data?.cats.length ?? 0) > 0 && (
        <div className="scr" style={{ marginBottom: 6 }}>
          <button className={`chip${!cat ? " on" : ""}`} style={{ minHeight: 32, fontSize: 13 }} onClick={() => go("")}>كل الأقسام</button>
          {data!.cats.map((c) => <button key={c.id} className={`chip${cat === c.id ? " on" : ""}`} style={{ minHeight: 32, fontSize: 13 }} onClick={() => go(c.id)}>{c.name}</button>)}
        </div>
      )}
      {showF && <div className="card sm mt">{filters}</div>}
      <div className="row mt" style={{ alignItems: "flex-start", gap: 24 }}>
        <aside className="card hm" style={{ width: 270, flex: "none", flexDirection: "column" }}><b style={{ marginBottom: 10 }}>فلترة النتائج</b>{filters}</aside>
        <div className="sp">
          {loading ? <Loading rows={3} /> : list.length ? (
            <><div className="grid" style={st("--m:2;--d:4")}>{list.map((p) => <ProductCard key={p.id} p={p} verified={data?.verified.has(p.merchantId)} />)}</div>{more && !q && <div className="c mt2"><button className="btn o" disabled={busyMore} onClick={loadMore}>{busyMore ? "جاري التحميل…" : "عرض المزيد"}</button></div>}</>
          ) : (
            <Empty icon="ph-magnifying-glass" title="مفيش نتايج مطابقة" sub="جرّب كلمة تانية أو شيل بعض الفلاتر، أو اطلب المنتج والتجار يدوروا لك."><Link href="/rfq" className="btn">اطلب منتج</Link></Empty>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Search() {
  return <Suspense fallback={<div className="wc"><Loading /></div>}><Results /></Suspense>;
}
