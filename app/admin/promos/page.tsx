"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { st } from "@/lib/style";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { listActiveProducts, listCategories } from "@/lib/store";
import { deletePromo, discounted, listPromos, promoLabel, promoStatus, savePromo } from "@/lib/promos";
import { uploadImage } from "@/lib/img";
import { sized } from "@/lib/media";
import { norm } from "@/components/SearchBox";
import { PromoCard } from "@/components/Promos";
import type { Promo } from "@/lib/types";

type Draft = Omit<Promo, "id">;
const blank = (): Draft => ({ title: "", sub: "", kind: "percent", value: 10, scope: "category", categoryIds: [], productIds: [], startsAt: "", endsAt: "", active: true, color: "", image: "", order: 0, minQty: 0 });
const COLORS = ["", "#c0392b", "#0f4535", "#b08a4f", "#7d3c98", "#1f618d", "#d35400"];

export default function AdminPromos() {
  const { user } = useApp();
  const { data, loading, reload } = useAsync(async () => {
    const [promos, cats, products] = await Promise.all([listPromos(true), listCategories(), listActiveProducts()]);
    return { promos, cats, products };
  });
  const [edit, setEdit] = useState<{ id: string | null; d: Draft } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const cats = data?.cats ?? [];
  const products = data?.products ?? [];
  const catName = (id: string) => cats.find((c) => c.id === id)?.name || id;

  const d = edit?.d;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEdit((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));
  const toggle = (k: "categoryIds" | "productIds", id: string) => d && set(k, d[k].includes(id) ? d[k].filter((x) => x !== id) : [...d[k], id]);

  const shown = useMemo(() => {
    const n = norm(q);
    return products.filter((p) => !n || norm(p.name).includes(n) || norm(p.categoryName || "").includes(n)).slice(0, 200);
  }, [products, q]);
  const affected = useMemo(() => {
    if (!d) return 0;
    if (d.scope === "all") return products.length;
    return d.scope === "category" ? products.filter((p) => d.categoryIds.includes(p.categoryId)).length : d.productIds.length;
  }, [d, products]);

  const pickImg = async (f?: File) => {
    if (!f || !user) return;
    setMsg("جاري رفع الصورة…");
    try { set("image", await uploadImage(f, user.uid, "products")); setMsg(""); } catch (e) { setMsg("فشل الرفع: " + String((e as Error)?.message || e)); }
  };
  const save = async () => {
    if (!edit || !d) return;
    if (!d.title.trim()) return setMsg("اكتب اسم العرض");
    if (!(d.value > 0) || (d.kind === "percent" && d.value > 90)) return setMsg("قيمة الخصم لازم تكون أكبر من صفر (والنسبة لحد 90%)");
    if (d.scope === "category" && !d.categoryIds.length) return setMsg("اختار قسم واحد على الأقل");
    if (d.scope === "products" && !d.productIds.length) return setMsg("اختار منتج واحد على الأقل");
    if (d.startsAt && d.endsAt && d.endsAt < d.startsAt) return setMsg("تاريخ النهاية قبل البداية");
    setBusy(true); setMsg("");
    try {
      await savePromo(edit.id, { ...d, title: d.title.trim(), sub: (d.sub || "").trim(), order: edit.id ? d.order : (data?.promos.length ?? 0) });
      setEdit(null); reload();
      setMsg("اتحفظ ✓ — العرض هيظهر للعملاء خلال دقايق (أو بعد تحديث الصفحة)");
    } catch (e) { setMsg("حصلت مشكلة: " + String((e as Error)?.message || e)); }
    setBusy(false);
  };
  const remove = async (pr: Promo) => {
    if (!confirm(`حذف العرض "${pr.title}"؟`)) return;
    await deletePromo(pr.id); reload();
  };
  const flip = async (pr: Promo) => { const { id, ...rest } = pr; await savePromo(id, { ...rest, active: !pr.active }); reload(); };

  if (edit && d) {
    const sample = 100;
    return (
      <div className="card col" style={{ gap: 16 }}>
        <div className="row"><h3 className="sp">{edit.id ? "تعديل عرض" : "عرض جديد"}</h3><button className="btn o sm2" onClick={() => setEdit(null)}>رجوع</button></div>

        <div className="fld"><label>اسم العرض (بيظهر للعميل)</label><input className="in" placeholder="مثال: تخفيضات الشتا على الهدوم" value={d.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div className="fld"><label>جملة صغيرة (اختياري)</label><input className="in" placeholder="مثال: لفترة محدودة" value={d.sub} onChange={(e) => set("sub", e.target.value)} /></div>

        <b>نوع الخصم</b>
        <div className="grid" style={st("--m:2;--d:2;gap:10px")}>
          <div className={`opt ${d.kind === "percent" ? "on" : ""}`} onClick={() => set("kind", "percent")}><i className="ph ph-percent" />نسبة مئوية %<span className="ck"><i className="ph ph-check" /></span></div>
          <div className={`opt ${d.kind === "fixed" ? "on" : ""}`} onClick={() => set("kind", "fixed")}><i className="ph ph-money" />مبلغ ثابت ج.م<span className="ck"><i className="ph ph-check" /></span></div>
        </div>
        <div className="fld"><label>{d.kind === "percent" ? "نسبة الخصم %" : "قيمة الخصم من سعر الوحدة (ج.م)"}</label>
          <input className="in" inputMode="decimal" value={d.value || ""} onChange={(e) => set("value", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
          <small>مثال: منتج سعره {sample} ج.م هيبقى <b>{discounted(sample, d)} ج.م</b> · الخصم بيتطبق على كل شرائح الكمية.</small>
        </div>

        <div className="fld"><label>شرط الكمية: أقل عدد قطع لازم يشتريها من العرض (اختياري)</label>
          <input className="in" inputMode="numeric" placeholder="مثال: 5 — سيبه فاضي لو مفيش شرط" value={d.minQty || ""} onChange={(e) => set("minQty", Number(e.target.value.replace(/\D/g, "")) || 0)} />
          <small>{(d.minQty ?? 0) > 1 ? <>الخصم بيتطبق بس لما مجموع القطع من منتجات العرض في السلة يوصل <b>{d.minQty}</b> (يقدر يجمع من أكتر من منتج). قبل كده بيشوف السعر العادي ورسالة "ناقصك كام قطعة".</> : "من غير شرط: الخصم بيتطبق على أي كمية."}</small>
        </div>

        <b>العرض على إيه؟</b>
        <div className="grid" style={st("--m:3;--d:3;gap:10px")}>
          {([["category", "أقسام", "ph-squares-four"], ["products", "منتجات محددة", "ph-package"], ["all", "كل الموقع", "ph-globe"]] as const).map(([k, t, ic]) => (
            <div key={k} className={`opt ${d.scope === k ? "on" : ""}`} onClick={() => set("scope", k)}><i className={`ph ${ic}`} />{t}<span className="ck"><i className="ph ph-check" /></span></div>
          ))}
        </div>

        {d.scope === "category" && (
          <div className="row wrap g8">
            {cats.map((c) => <button key={c.id} type="button" className={`chip${d.categoryIds.includes(c.id) ? " on" : ""}`} onClick={() => toggle("categoryIds", c.id)}>{d.categoryIds.includes(c.id) && <i className="ph ph-check" />} {c.name}</button>)}
            {!cats.length && <small>مفيش أقسام لسه.</small>}
          </div>
        )}
        {d.scope === "products" && (
          <div className="col g8">
            <div className="row g8"><input className="in sp" placeholder="ابحث باسم المنتج أو القسم…" value={q} onChange={(e) => setQ(e.target.value)} /><span className="bd">{d.productIds.length} مختار</span></div>
            <div className="pick">
              {shown.map((p) => (
                <label key={p.id}>
                  <input type="checkbox" checked={d.productIds.includes(p.id)} onChange={() => toggle("productIds", p.id)} />
                  {p.images?.[0] ? <img src={sized(p.images[0], 80)} alt="" /> : <i className="ph ph-package" />}
                  <span className="sp" style={{ minWidth: 0 }}>{p.name}<br /><small>{p.categoryName} · {p.tiers?.[0]?.price ?? 0} ج.م</small></span>
                </label>
              ))}
              {!shown.length && <small style={{ padding: 12, display: "block" }}>مفيش نتايج.</small>}
            </div>
          </div>
        )}
        <div className="alert">العرض هيتطبق على <b>{affected}</b> منتج منشور.</div>

        <div className="grid" style={st("--m:2;--d:2;gap:10px")}>
          <div className="fld"><label>يبدأ من (اختياري)</label><input className="in" type="date" value={d.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></div>
          <div className="fld"><label>ينتهي في (اختياري)</label><input className="in" type="date" value={d.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></div>
        </div>

        <b>شكل البانر</b>
        <div className="row wrap g8">
          {COLORS.map((c) => <button key={c || "def"} type="button" aria-label={c || "افتراضي"} onClick={() => set("color", c)} style={{ width: 34, height: 34, borderRadius: 10, border: d.color === c ? "3px solid var(--gold)" : "1px solid var(--bd)", background: c || "linear-gradient(135deg,#0a3427,#145c46)", cursor: "pointer" }} />)}
          {d.image ? <button className="btn r sm2" onClick={() => set("image", "")}>شيل الصورة</button>
            : <label className="btn o sm2" style={{ cursor: "pointer" }}><i className="ph ph-image" />صورة خلفية<input type="file" accept="image/*" hidden onChange={(e) => pickImg(e.target.files?.[0])} /></label>}
        </div>
        <div style={{ maxWidth: 420 }}><PromoCard pr={{ id: "preview", ...d, title: d.title || "اسم العرض" }} /></div>

        <label className="row g8" style={{ cursor: "pointer" }}><input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} />العرض شغال</label>
        <div className="row"><button className="btn" disabled={busy} onClick={save}>{busy ? "جاري الحفظ…" : "حفظ العرض"}</button>{msg && <span className="mu">{msg}</span>}</div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row"><h3 className="sp">العروض والخصومات</h3><button className="btn" onClick={() => { setMsg(""); setEdit({ id: null, d: blank() }); }}><i className="ph ph-plus" />عرض جديد</button></div>
      <small>اعمل خصم على قسم كامل (زي الهدوم) أو منتجات تختارها. السعر بيتعدّل تلقائي في الكارت وصفحة المنتج والسلة، وبيظهر عليه شارة الخصم والسعر القديم متشطب.</small>
      {msg && <div className="alert">{msg}</div>}
      {loading ? <div className="skel" style={{ minHeight: 120 }} /> : !data?.promos.length ? (
        <div className="card col" style={{ alignItems: "center", textAlign: "center", gap: 10 }}><i className="ph ph-tag" style={{ fontSize: 40, color: "var(--gold)" }} /><b>لسه مفيش عروض</b><small>ابدأ بأول عرض على قسم أو منتجات.</small></div>
      ) : data.promos.map((pr) => {
        const [t, c] = promoStatus(pr);
        return (
          <div key={pr.id} className="card row wrap" style={{ gap: 10 }}>
            <span style={{ width: 46, height: 46, borderRadius: 12, background: pr.color || "var(--pm)", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><i className="ph-fill ph-tag" style={{ fontSize: 22 }} /></span>
            <div className="col g4 sp" style={{ minWidth: 180 }}>
              <b>{pr.title} <span className={`bd ${c}`}>{t}</span></b>
              <small>{promoLabel(pr)} · {pr.scope === "all" ? "كل الموقع" : pr.scope === "category" ? pr.categoryIds.map(catName).join("، ") : `${pr.productIds.length} منتج`}{pr.endsAt ? ` · لحد ${pr.endsAt}` : ""}</small>
            </div>
            <Link className="btn o sm2" href={`/offers?id=${pr.id}`}>عرض</Link>
            <button className="btn o sm2" onClick={() => flip(pr)}>{pr.active ? "إيقاف" : "تشغيل"}</button>
            <button className="btn sm2" onClick={() => { const { id, ...rest } = pr; setMsg(""); setEdit({ id, d: { ...blank(), ...rest } }); }}>تعديل</button>
            <button className="btn r sm2" onClick={() => remove(pr)} aria-label="حذف"><i className="ph ph-trash" /></button>
          </div>
        );
      })}
    </div>
  );
}
