"use client";
import { sized } from "@/lib/media";
import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, limit, query, updateDoc, writeBatch } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { ms } from "@/lib/format";
import { Empty, Status } from "@/components/Ui";
import { DEFAULT_RULES, rangeText, tiersFromRules, type PriceRule } from "@/lib/pricing";
import { saveRules } from "@/lib/rules";
import { useApp } from "@/lib/providers";
import { createSupplier, listSuppliers } from "@/lib/suppliers";
import { RulesEditor } from "@/components/Markup";
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
  const { settings } = useApp();
  const sup = useAsync(listSuppliers, []);
  const supName = (id?: string | null) => sup.data?.find((s) => s.id === id)?.name;
  const [sf, setSf] = useState("");           // supplier filter
  const [sel, setSel] = useState<string[]>([]); // selected product ids
  const [assignTo, setAssignTo] = useState("");
  const [amsg, setAmsg] = useState("");
  const newSupplier = async () => {
    const n = prompt("اسم المورد (بيظهر للإدارة بس):")?.trim();
    if (!n) return null;
    const s = await createSupplier(n); sup.reload(); return s.id;
  };
  const assign = async () => {
    let id = assignTo;
    if (id === "__new") { const x = await newSupplier(); if (!x) return; id = x; setAssignTo(x); }
    if (!sel.length) return setAmsg("علّم على المنتجات الأول.");
    let b = writeBatch(dbI()), k = 0;
    for (const pid of sel) { b.update(doc(dbI(), "products", pid), { supplierId: id || null }); if (++k % 400 === 0) { await b.commit(); b = writeBatch(dbI()); } }
    await b.commit();
    setAmsg(`تم ربط ${sel.length} منتج${id ? ` بالمورد ${supName(id) || ""}` : " (اتشال المورد)"}.`); setSel([]); reload();
  };
  const [rules, setRules] = useState<PriceRule[]>(settings.markupRules?.length ? settings.markupRules : DEFAULT_RULES);
  const savedRules = JSON.stringify(settings.markupRules ?? null);
  useEffect(() => { if (settings.markupRules?.length) setRules(settings.markupRules); // saved defaults arrive after first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRules]);
  const [mmsg, setMmsg] = useState("");
  const merchants = Array.from(new Map((data ?? []).map((p) => [p.merchantId, p.merchantName])).entries());
  // Applies the markup on top of each product's ORIGINAL price (saved the first time), so applying it twice never stacks.
  const applyMarkup = async () => {
    const target = (data ?? []).filter((p) => who === "all" || (who.startsWith("sup:") ? p.supplierId === who.slice(4) : p.merchantId === who));
    const good = rules.map((r) => ({ ...r, tiers: r.tiers.filter((x) => x.min > 0) })).filter((r) => r.tiers.length);
    if (!who || !good.length || !target.length) return setMmsg("اختار التاجر وحدد الشرايح.");
    if (!confirm(`هتتغيّر أسعار ${target.length} منتج حسب شرايح السعر والكمية، محسوبة على السعر الأصلي. متأكد؟`)) return;
    saveRules(good).catch(() => {});
    let b = writeBatch(dbI()), k = 0;
    for (const p of target) {
      // original price = saved base, or (first time) today's price for the smallest quantity
      const base = p.basePrices?.[0] ?? [...p.tiers].sort((x, y) => x.min - y.min)[0]?.price ?? 0;
      if (!(base > 0)) continue;
      const { tiers, rule } = tiersFromRules(base, good);
      if (!tiers.length) continue;
      b.update(doc(dbI(), "products", p.id), { basePrices: [base], markup: null, markupTiers: rule?.tiers ?? null, tiers, moq: tiers[0].min });
      if (++k % 400 === 0) { await b.commit(); b = writeBatch(dbI()); }
    }
    await b.commit();
    setMmsg(`تم تحديث ${target.length} منتج.`); reload();
  };
  useEffect(() => { if (new URLSearchParams(window.location.search).get("f") === "pending") setF("pending"); }, []);
  const pendingN = (data ?? []).filter((p) => p.status === "pending").length;
  const [rmsg, setRmsg] = useState("");
  const bulk = async (ids: string[], action: "active" | "hidden" | "delete") => {
    if (!ids.length) return setRmsg("علّم على المنتجات الأول.");
    if (action === "delete" && !confirm(`حذف ${ids.length} منتج نهائياً؟`)) return;
    let b = writeBatch(dbI()), k = 0;
    for (const pid of ids) {
      if (action === "delete") b.delete(doc(dbI(), "products", pid)); else b.update(doc(dbI(), "products", pid), { status: action });
      if (++k % 400 === 0) { await b.commit(); b = writeBatch(dbI()); }
    }
    await b.commit();
    setRmsg(action === "active" ? `اتنشر ${ids.length} منتج ✓` : action === "hidden" ? `اتخفى ${ids.length} منتج` : `اتحذف ${ids.length} منتج`);
    setSel([]); reload();
  };
  const list = (data ?? []).filter((p) => (f === "all" || p.status === f) && (!q || p.name.includes(q)) && (!sf || (sf === "__none" ? !p.supplierId : p.supplierId === sf)));
  return (
    <>
      <div className="row wrap"><b className="sp" style={{ fontSize: 18 }}>المنتجات ({data?.length ?? 0})</b><Link className="btn" href="/admin/products/new">+ إضافة منتج</Link></div>
      {pendingN > 0 && f !== "pending" && (
        <div className="alert row wrap" style={{ borderColor: "var(--gold)" }}>
          <i className="ph ph-hourglass" style={{ color: "var(--gold)", fontSize: 22 }} />
          <span className="sp">فيه <b>{pendingN}</b> منتج مستني المراجعة قبل ما يظهر للعملاء (من الاستيراد).</span>
          <button className="btn gd sm2" onClick={() => { setF("pending"); setSel([]); }}><i className="ph ph-eye" />مراجعة</button>
        </div>
      )}
      {f === "pending" && (
        <div className="card col" style={{ gap: 10, borderColor: "var(--gold)" }}>
          <b><i className="ph ph-eye" style={{ color: "var(--gold)" }} /> مراجعة المنتجات قبل النشر</b>
          <small>المنتجات دي مش ظاهرة للعملاء. افتح أي منتج بـ "تعديل" علشان تراجع الاسم والسعر والصور، وبعدين انشره. أو علّم على كذا منتج وانشرهم مرة واحدة.</small>
          <div className="row wrap">
            <button className="btn o sm2" onClick={() => setSel(list.map((p) => p.id))}>علّم الكل ({list.length})</button>
            <button className="btn o sm2" onClick={() => setSel([])}>شيل العلامات</button>
            <span className="sp"><b>{sel.length}</b> متعلّم</span>
            <button className="btn sm2" disabled={!sel.length} onClick={() => bulk(sel, "active")}><i className="ph ph-check" />نشر المتعلّم</button>
            <button className="btn r sm2" disabled={!sel.length} onClick={() => bulk(sel, "delete")}><i className="ph ph-trash" />حذف المتعلّم</button>
          </div>
          {rmsg && <span className="ok">{rmsg}</span>}
        </div>
      )}
      <div className="row wrap">
        {[["all", "الكل"], ["active", "منشور"], ["pending", `مراجعة${pendingN ? ` (${pendingN})` : ""}`], ["hidden", "مخفي"]].map(([k, t]) => <button key={k} className={`chip ${f === k ? "on" : ""}`} onClick={() => { setF(k); setSel([]); }}>{t}</button>)}
        <input className="in" style={{ maxWidth: 220 }} placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ maxWidth: 200 }} value={sf} onChange={(e) => setSf(e.target.value)} aria-label="المورد">
          <option value="">كل الموردين</option><option value="__none">من غير مورد</option>
          {sup.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="card col" style={{ gap: 10 }}>
        <b>ربط المنتجات بمورد <small>(اسم المورد بيظهر للإدارة بس، والعميل بيشوف المتجر عادي)</small></b>
        <div className="row wrap">
          <button className="btn o sm2" onClick={() => setSel(list.map((p) => p.id))}>علّم المعروض ({list.length})</button>
          <button className="btn o sm2" onClick={() => setSel([])}>شيل العلامات</button>
          <span className="sp"><b>{sel.length}</b> متعلّم</span>
          <select className="in" style={{ maxWidth: 220 }} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="">بدون مورد</option>
            {sup.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new">+ مورد جديد…</option>
          </select>
          <button className="btn" onClick={assign} disabled={!sel.length}>ربط</button>
        </div>
        {amsg && <span className="ok">{amsg}</span>}
      </div>
      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>زيادة / تعديل الأسعار بنسبة %</summary>
        <div className="col" style={{ marginTop: 12 }}>
          <small>النسب بتتحسب دايماً على السعر الأصلي للمنتج (قبل أي زيادة)، فتطبيقها أكتر من مرة مش بيزوّد السعر مرتين. شريحة واحدة "من 1 قطعة: 0%" بترجّع السعر الأصلي.</small>
          <div className="row wrap">
            <select className="in" style={{ maxWidth: 260 }} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">اختار التاجر…</option><option value="all">كل المنتجات</option>
              <optgroup label="المتجر الظاهر للعميل">{merchants.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</optgroup>
              {(sup.data?.length ?? 0) > 0 && <optgroup label="المورد (للإدارة بس)">{sup.data!.map((s) => <option key={s.id} value={`sup:${s.id}`}>مورد: {s.name}</option>)}</optgroup>}
            </select>
          </div>
          <RulesEditor value={rules} onChange={setRules} />
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={applyMarkup}>تطبيق على منتجات التاجر</button>
          {mmsg && <span className="ok">{mmsg}</span>}
        </div>
      </details>
      {loading ? <div className="skel" /> : !list.length ? <Empty icon="ph-package" title="مفيش منتجات" sub="ابدأ بإضافة أول منتج." /> : (
        <div className="col">
          {list.map((p) => (
            <div key={p.id} className="card row wrap" style={sel.includes(p.id) ? { borderColor: "var(--pa)", background: "#f3f8f5" } : undefined}>
              <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} style={{ width: 20, height: 20, accentColor: "var(--pa)" }} aria-label="اختيار" />
              {p.images?.[0] ? <img className="ph-thumb" src={sized(p.images[0], 120)} alt="" loading="lazy" /> : <div className="ph-thumb" />}
              <div className="sp" style={{ minWidth: 160 }}><b>{p.name}</b><br /><small>{p.merchantName} · {p.categoryName} · {rangeText(p)} ج.م{p.markupTiers?.length ? ` (${p.markupTiers.map((x) => `${x.min}+: ${x.pct}%`).join(" / ")})` : p.markup ? ` (+${p.markup}%)` : ""}</small></div>
              {supName(p.supplierId) && <span className="bd w"><i className="ph ph-truck" />{supName(p.supplierId)}</span>}
              <Status s={p.status} />
              <Link className="btn o sm2" href={`/admin/products/${p.id}`}>تعديل</Link>
              {p.status !== "active" ? <button className="btn sm2" onClick={() => set(p, "active")}>{p.status === "pending" ? "موافقة ونشر" : "نشر"}</button> : <button className="btn o sm2" onClick={() => set(p, "hidden")}>إخفاء</button>}
              <button className="btn r sm2" onClick={() => del(p)}>حذف</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
