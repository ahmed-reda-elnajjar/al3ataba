"use client";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { listApprovedMerchants, listCategories } from "@/lib/store";
import { uploadFromUrl } from "@/lib/img";
import { HOUSE, ICONS } from "@/lib/config";
import { DEFAULT_RULES, tiersFromRules, type PriceRule } from "@/lib/pricing";
import { saveRules } from "@/lib/rules";
import { createSupplier, listSuppliers } from "@/lib/suppliers";
import { RulesEditor } from "@/components/Markup";
import type { Category } from "@/lib/types";

/* Imports a partner's catalogue from a 6valley (6amTech) store — e.g. alwazeers.com — through its public API. */

type SrcProduct = {
  id: number; name: string; slug?: string; unit?: string; min_qty?: number; minimum_order_qty?: number;
  images?: string | (string | { image_name?: string })[]; thumbnail?: string; colors?: string | string[]; colors_formatted?: { name: string; code: string }[];
  choice_options?: string | { title: string; options: string[] }[]; category_ids?: string | { id: string | number }[]; category_id?: string | number;
  unit_price: number; discount?: number; discount_type?: string; details?: string | null; published?: number; status?: number; code?: string;
};
type SrcCat = { id: number; name: string; childes?: SrcCat[] };
const flatCats = (cs: SrcCat[]): SrcCat[] => cs.flatMap((c) => [c, ...flatCats(c.childes || [])]);
type Row = { key: string; src: SrcProduct; name: string; base: number; pack: string; price: string; edited?: boolean; moq: string; cat: string; imgs: string[]; on: boolean; state?: "ok" | "err" | "busy"; note?: string };

const COLOR_AR: Record<string, string> = { black: "أسود", white: "أبيض", red: "أحمر", blue: "أزرق", green: "أخضر", yellow: "أصفر", pink: "بينك", purple: "موف", gray: "رمادي", grey: "رمادي", silver: "فضي", gold: "ذهبي", brown: "بني", orange: "برتقالي", navy: "كحلي", beige: "بيج" };
const arr = <T,>(v: unknown): T[] => { if (Array.isArray(v)) return v as T[]; if (typeof v === "string") { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } } return []; };
const strip = (h?: string | null) => (h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
const finalPrice = (p: SrcProduct) => { const d = Number(p.discount) || 0; const u = Number(p.unit_price) || 0; return Math.max(0, Math.round((p.discount_type === "percent" ? u * (1 - d / 100) : u - d) * 100) / 100); };
const srcCat = (p: SrcProduct) => String(arr<{ id: string | number }>(p.category_ids)[0]?.id ?? p.category_id ?? "0");
function imageUrls(base: string, p: SrcProduct) {
  const names = arr<string | { image_name?: string }>(p.images).map((x) => (typeof x === "string" ? x : x.image_name || "")).filter(Boolean);
  const urls = names.map((n) => (/^https?:/.test(n) ? n : `${base}/storage/app/public/product/${n}`));
  if (!urls.length && p.thumbnail) urls.push(/^https?:/.test(p.thumbnail) ? p.thumbnail : `${base}/storage/app/public/product/thumbnail/${p.thumbnail}`);
  return urls.slice(0, 8);
}
const norm = (s: string) => s.toLowerCase().replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();

type Source = { name: string; url: string; supplierId?: string };
const cleanUrl = (u: string) => u.trim().replace(/\/+$/, "").split("?")[0];

export default function ImportSite() {
  const cats = useAsync(listCategories, []);
  const merchants = useAsync(listApprovedMerchants, []);
  const [base, setBase] = useState("https://alwazeers.com");
  const [rows, setRows] = useState<Row[]>([]);
  const [srcCats, setSrcCats] = useState<SrcCat[]>([]);
  const [map, setMap] = useState<Record<string, string>>({}); // source cat id → our cat id | "new"
  const [owner, setOwner] = useState(HOUSE.id);
  const sup = useAsync(listSuppliers, []);
  const [supplier, setSupplier] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [onlyPublished, setOnlyPublished] = useState(false);
  const { user, settings } = useApp();
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => { setSources(settings.importSources ?? []); }, [settings.importSources]);
  const saveSources = async (next: Source[]) => {
    setSources(next);
    try { await setDoc(doc(dbI(), "settings", "site"), { importSources: next }, { merge: true }); } catch { setErr("مقدرتش أحفظ اللينكات — اتأكد إنك داخل بحساب الأدمن."); }
  };
  const currentSrc = sources.find((s) => cleanUrl(s.url) === cleanUrl(base));
  const addSource = () => {
    const url = cleanUrl(base);
    if (!/^https?:\/\//.test(url)) return setErr("اكتب اللينك كامل يبدأ بـ https://");
    const name = prompt("اسم المصدر (مثال: الوزير):", currentSrc?.name || "")?.trim();
    if (!name) return;
    const sid = supplier && supplier !== "__new" ? supplier : currentSrc?.supplierId;
    saveSources([...sources.filter((s) => cleanUrl(s.url) !== url), { name, url, ...(sid ? { supplierId: sid } : {}) }]);
    setMsg(`اتحفظ "${name}" ✓`);
  };
  const pickSource = (url: string) => {
    const s = sources.find((x) => x.url === url);
    if (!s) return;
    setBase(s.url); setRows([]); setMsg(""); setErr("");
    if (s.supplierId) setSupplier(s.supplierId);
  };
  const [rules, setRules] = useState<PriceRule[]>(settings.markupRules?.length ? settings.markupRules : DEFAULT_RULES);
  const savedRules = JSON.stringify(settings.markupRules ?? null);
  useEffect(() => { if (settings.markupRules?.length) setRules(settings.markupRules); // saved defaults arrive after first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRules]);
  const tiersOf = (base: number) => tiersFromRules(base, rules).tiers;
  const packOf = (r: Row) => Math.max(0, Math.floor(Number(r.pack) || 0));
  const unitBase = (r: Row) => (packOf(r) > 1 ? Math.round(r.base * packOf(r) * 100) / 100 : r.base);
  const tiersText = (base: number) => tiersOf(base).map((t) => `${t.min}+ ← ${t.price}`).join("  ·  ");
  const b = base.replace(/\/+$/, "").split("?")[0];

  const accept = async (products: SrcProduct[], categories: SrcCat[]) => {
    const uniq = Array.from(new Map(products.map((p) => [p.id, p])).values());
    let seen = new Set<string>();
    let names = new Set<string>();
    try {
      const old = await getDocs(collection(dbI(), "products")); // admin: every product, any source
      seen = new Set(old.docs.map((d) => d.get("sourceId") as string).filter(Boolean));
      names = new Set(old.docs.map((d) => norm(String(d.get("name") || ""))).filter(Boolean));
    } catch { /* best effort */ }
    const host = new URL(b).host;
    setRows(uniq.map((p) => {
      const key = `${host}:${p.id}`;
      const moq = String(Math.max(1, Number(p.minimum_order_qty) || Number(p.min_qty) || 1));
      const dup = seen.has(key) || names.has(norm(p.name || ""));
      return { key, src: p, name: p.name || "", base: finalPrice(p), pack: "", price: "", moq, cat: srcCat(p), imgs: imageUrls(b, p), on: !dup, state: seen.has(key) ? "ok" as const : undefined, note: seen.has(key) ? "موجود قبل كده" : dup ? "فيه منتج عندك بنفس الاسم — علّمه لو مختلف" : "" };
    }));
    setSrcCats(flatCats(categories));
    // auto-match categories by name
    const ours = cats.data ?? [];
    const m: Record<string, string> = {};
    for (const id of new Set(uniq.map(srcCat))) {
      const name = categories.find((c) => String(c.id) === id)?.name || "";
      m[id] = ours.find((c) => name && norm(c.name) === norm(name))?.id || (name ? "new" : "");
    }
    setMap(m);
    const fresh = uniq.filter((p) => !seen.has(`${host}:${p.id}`) && !names.has(norm(p.name || ""))).length;
    setMsg(`اتلقى ${uniq.length} منتج — منهم ${fresh} جديد و ${uniq.length - fresh} موجودين عندك قبل كده`);
  };

  const fetchAll = async () => {
    setErr(""); setMsg(""); setLoading(true); setRows([]);
    try {
      const api = (path: string) => fetch(`${b}/api/v1/${path}${path.includes("?") ? "&" : "?"}guest_id=1`, { headers: { Accept: "application/json" } }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
      const categories: SrcCat[] = await api("categories").catch(() => []);
      const first = await api("products/latest?limit=100&offset=1");
      const total = Number(first.total_size) || 0;
      let products: SrcProduct[] = first.products || [];
      for (let page = 2; products.length < total && page <= 60; page++) {
        setMsg(`جاري الجلب… ${products.length} من ${total}`);
        const r = await api(`products/latest?limit=100&offset=${page}`);
        if (!r.products?.length) break;
        products = products.concat(r.products);
      }
      // "latest" can skip some items: also read every category (and sub-category) directly
      const all = flatCats(categories);
      for (let k = 0; k < all.length; k += 4) {
        setMsg(`جاري الجلب من الأقسام… ${Math.min(k + 4, all.length)} من ${all.length} (${new Set(products.map((p) => p.id)).size} منتج لحد دلوقتي)`);
        const res = await Promise.all(all.slice(k, k + 4).map((c) => api(`categories/products/${c.id}`).catch(() => [])));
        for (const r of res) { const list = Array.isArray(r) ? r : r?.products; if (Array.isArray(list)) products = products.concat(list); }
      }
      await accept(products, categories);
    } catch {
      setErr("المتصفح مقدرش يجيب المنتجات من الموقع مباشرة (غالباً الموقع مانع ده). استخدم طريقة الملفات اللي تحت.");
    }
    setLoading(false);
  };

  const fromFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr("");
    const products: SrcProduct[] = []; let categories: SrcCat[] = [];
    for (const f of Array.from(files)) {
      try {
        const j = JSON.parse(await f.text());
        if (Array.isArray(j) && j[0] && "childes" in j[0]) categories = j;
        else if (Array.isArray(j?.products)) products.push(...j.products);
        else if (Array.isArray(j) && j[0]?.unit_price !== undefined) products.push(...j);
      } catch { setErr(`الملف ${f.name} مش JSON صحيح.`); }
    }
    if (!products.length) return setErr("مالقيتش منتجات في الملفات.");
    await accept(products, categories);
  };

  const upd = (key: string, v: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...v } : r)));
  const visible = rows.filter((r) => !onlyPublished || r.src.published !== 0);
  const chosen = visible.filter((r) => r.on && r.state !== "ok");
  const srcCatIds = useMemo(() => Array.from(new Set(rows.map((r) => r.cat))), [rows]);
  const catName = (id: string) => srcCats.find((c) => String(c.id) === id)?.name || `قسم رقم ${id}`;

  const run = async () => {
    if (!user) return;
    const m = owner === HOUSE.id ? { id: HOUSE.id, name: HOUSE.name, governorate: "القاهرة" } : merchants.data?.find((x) => x.id === owner);
    if (!m) return setErr("اختار التاجر.");
    const missing = srcCatIds.filter((id) => chosen.some((r) => r.cat === id) && !map[id]);
    if (missing.length) return setErr("اختار قسم لكل أقسام الموقع التاني (فوق).");
    let supplierId = supplier;
    if (supplier === "__new") { const n = prompt("اسم المورد (للإدارة بس):", "الوزير")?.trim(); if (!n) return; supplierId = (await createSupplier(n)).id; setSupplier(supplierId); sup.reload(); }
    setErr(""); setRunning(true);
    saveRules(rules).catch(() => {});
    // create the new categories first
    const ours: Category[] = [...(cats.data ?? [])];
    const resolved: Record<string, Category> = {};
    for (const id of srcCatIds) {
      if (map[id] === "new") {
        const name = catName(id);
        const ex = ours.find((c) => norm(c.name) === norm(name));
        if (ex) { resolved[id] = ex; continue; }
        const ref = await addDoc(collection(dbI(), "categories"), { name, icon: ICONS[3], order: ours.length + 1 });
        const c = { id: ref.id, name, icon: ICONS[3], order: ours.length + 1 }; ours.push(c); resolved[id] = c;
      } else if (map[id]) { const c = ours.find((x) => x.id === map[id]); if (c) resolved[id] = c; }
    }
    for (const r of chosen) {
      const c = resolved[r.cat];
      const tiers = r.edited ? [{ min: Math.max(1, Number(r.moq) || 1), price: Number(r.price) }] : tiersOf(unitBase(r));
      const q = tiers[0]?.min || 1, price = tiers[0]?.price || 0;
      if (!(price > 0) || r.name.trim().length < 2 || !c) { upd(r.key, { state: "err", note: !c ? "مفيش قسم" : "ناقص اسم أو سعر" }); continue; }
      upd(r.key, { state: "busy", note: "" });
      try {
        const images: string[] = [];
        for (const u of r.imgs) { try { images.push(await uploadFromUrl(u)); } catch { images.push(u); } }
        if (!images.length) throw new Error("no-img");
        const p = r.src, name = r.name.trim();
        const colors = (p.colors_formatted?.length ? p.colors_formatted.map((x) => COLOR_AR[x.name.toLowerCase()] || x.name) : arr<string>(p.colors)).filter(Boolean);
        const specs = arr<{ title: string; options: string[] }>(p.choice_options).map((o) => ({ k: o.title, v: (o.options || []).join("، ") })).filter((s) => s.k && s.v);
        if (p.code) specs.push({ k: "كود المنتج", v: String(p.code) });
        await addDoc(collection(dbI(), "products"), {
          name, description: strip(p.details), categoryId: c.id, categoryName: c.name, unit: packOf(r) > 1 ? "شريحة" : p.unit === "pc" || !p.unit ? "قطعة" : p.unit, moq: q,
          tiers, basePrices: [unitBase(r)], markup: null, markupTiers: r.edited ? null : tiersFromRules(unitBase(r), rules).rule?.tiers ?? null, packSize: packOf(r) > 1 ? packOf(r) : null, governorate: m.governorate || "القاهرة", images, media: images, colors, specs,
          cod: true, madeInEgypt: false, logoPrint: false, status: "pending", // reviewed by admin before going live
          keywords: Array.from(new Set(`${name} ${c.name}`.toLowerCase().split(/\s+/).filter((w) => w.length > 1))),
          merchantId: m.id, merchantName: m.name, supplierId: supplierId || null, ownerUid: user.uid, source: "6valley", sourceId: r.key, createdAt: serverTimestamp(),
        });
        upd(r.key, { state: "ok", note: "" }); setDone((d) => d + 1);
      } catch { upd(r.key, { state: "err", note: "فشل الحفظ" }); }
    }
    setRunning(false);
  };

  const ex = `${b}/api/v1/products/latest?limit=100&offset=1&guest_id=1`;
  return (
    <>
      <div className="card col">
        <h3>استيراد منتجات من موقع تاجر</h3>
        <small>للمواقع المبنية على نظام 6valley (زي alwazeers.com). بيجيب الاسم والسعر بعد الخصم وأقل كمية والصور والوصف والألوان والمقاسات.</small>
        {sources.length > 0 && (
          <div className="row wrap g8">
            <b>المصادر المحفوظة:</b>
            {sources.map((s) => (
              <span key={s.url} className={`chip${cleanUrl(s.url) === cleanUrl(base) ? " on" : ""}`} onClick={() => pickSource(s.url)} title={s.url}>
                <i className="ph ph-link" />{s.name}
                <button className="cx" aria-label="حذف" onClick={(e) => { e.stopPropagation(); if (confirm(`حذف "${s.name}" من المصادر؟`)) saveSources(sources.filter((x) => x.url !== s.url)); }}><i className="ph ph-x" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="row wrap">
          <button className="btn o" onClick={addSource}><i className="ph ph-floppy-disk" />{currentSrc ? "تعديل الاسم" : "حفظ اللينك"}</button>
          <input className="in sp" style={{ direction: "ltr", minWidth: 220 }} value={base} onChange={(e) => setBase(e.target.value)} />
          <button className="btn" disabled={loading} onClick={fetchAll}>{loading ? "جاري الجلب…" : "جلب المنتجات"}</button>
        </div>
        {msg && <div className="ok">{msg}</div>}
        {err && <div className="alert e">{err}</div>}
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>لو الجلب المباشر مانفعش: طريقة الملفات</summary>
          <ol className="mu" style={{ paddingInlineStart: 18, lineHeight: 1.9 }}>
            <li>افتح الرابط ده في المتصفح، واحفظ الصفحة (Ctrl+S) باسم <b>p1.json</b>: <a href={ex} target="_blank" rel="noreferrer" style={{ direction: "ltr", display: "inline-block", color: "var(--pm)", wordBreak: "break-all" }}>{ex}</a></li>
            <li>لو المنتجات أكتر من 100، غيّر <b>offset=1</b> لـ 2 ثم 3… واحفظ كل صفحة (p2.json, p3.json…).</li>
            <li>واحفظ الأقسام من: <a href={`${b}/api/v1/categories?guest_id=1`} target="_blank" rel="noreferrer" style={{ direction: "ltr", display: "inline-block", color: "var(--pm)" }}>{`${b}/api/v1/categories?guest_id=1`}</a> باسم cats.json</li>
            <li>علشان مايفوتش أي منتج: لكل قسم افتح <span style={{ direction: "ltr", display: "inline-block" }}>{`${b}/api/v1/categories/products/رقم_القسم?guest_id=1`}</span> واحفظه (رقم القسم موجود في cats.json).</li>
            <li>اختار كل الملفات مرة واحدة هنا (المكرر بيتشال لوحده):</li>
          </ol>
          <input type="file" accept=".json,application/json" multiple onChange={(e) => fromFiles(e.target.files)} />
        </details>
      </div>

      {rows.length > 0 && (
        <>
          <div className="card col">
            <b>ربط الأقسام</b>
            <small>كل قسم عندهم يروح لأي قسم عندك، أو يتعمل قسم جديد بنفس الاسم.</small>
            {srcCatIds.map((id) => (
              <div key={id} className="row wrap">
                <span className="sp">{catName(id)} <small>({rows.filter((r) => r.cat === id).length} منتج)</small></span>
                <select className="in" style={{ maxWidth: 260 }} value={map[id] || ""} onChange={(e) => setMap({ ...map, [id]: e.target.value })}>
                  <option value="">اختار…</option>
                  <option value="new">+ قسم جديد: {catName(id)}</option>
                  {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="card col">
            <div className="row wrap">
              <div className="fld" style={{ minWidth: 220 }}><label>تنزل باسم</label>
                <select className="in" value={owner} onChange={(e) => setOwner(e.target.value)}><option value={HOUSE.id}>العتبة (الإدارة)</option>{merchants.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div className="fld" style={{ minWidth: 220 }}><label>المورد (للإدارة بس)</label>
                <select className="in" value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">بدون</option>{sup.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="__new">+ مورد جديد…</option></select></div>
              <label className="chk"><input type="checkbox" checked={onlyPublished} onChange={(e) => setOnlyPublished(e.target.checked)} />المنشور عندهم بس</label>
            </div>
            <div className="col g8"><b>نسبة الزيادة حسب سعر القطعة والكمية</b><RulesEditor value={rules} onChange={setRules} /></div>
            <div className="row wrap">
              <b className="sp">{visible.length} منتج · {chosen.length} متعلّم · {done} اتضاف للمراجعة</b>
              {done > 0 && !running && <a className="btn gd sm2" href="/admin/products?f=pending"><i className="ph ph-eye" />راجعهم وانشرهم</a>}
              <button className="btn o sm2" onClick={() => setRows((rs) => rs.map((r) => (r.state === "ok" ? r : { ...r, on: true })))}>علّم الكل</button>
              <button className="btn o sm2" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, on: false })))}>شيل الكل</button>
              <button className="btn" disabled={running || !chosen.length} onClick={run}>{running ? `جاري الإضافة… ${done}` : `إضافة ${chosen.length} منتج`}</button>
            </div>
            {err && <div className="alert e">{err}</div>}
          </div>
          <div className="col">
            {visible.slice(0, 600).map((r) => (
              <div key={r.key} className="card row wrap" style={{ alignItems: "flex-start", opacity: r.on || r.state === "ok" ? 1 : 0.55, borderColor: r.state === "ok" ? "var(--ok)" : r.state === "err" ? "var(--err)" : undefined }}>
                <input type="checkbox" checked={r.on} disabled={r.state === "ok"} onChange={(e) => upd(r.key, { on: e.target.checked })} style={{ width: 20, height: 20, accentColor: "var(--pa)", marginTop: 18 }} aria-label="اختيار" />
                {r.imgs[0] ? <img src={r.imgs[0]} alt="" className="ph-thumb" style={{ width: 72, height: 72 }} loading="lazy" /> : <span className="ph-thumb" style={{ width: 72, height: 72 }} />}
                <div className="sp col g8" style={{ minWidth: 220 }}>
                  <input className="in" value={r.name} onChange={(e) => upd(r.key, { name: e.target.value })} disabled={r.state === "ok"} />
                  <div className="row">
                    <input className="in" inputMode="decimal" value={r.price} placeholder="سعر مخصوص (اختياري)" onChange={(e) => upd(r.key, { price: e.target.value, edited: !!e.target.value })} disabled={r.state === "ok"} />
                    <input className="in" inputMode="numeric" value={r.moq} placeholder="أقل كمية" onChange={(e) => upd(r.key, { moq: e.target.value })} disabled={r.state === "ok"} />
                    <input className="in" inputMode="numeric" value={r.pack} placeholder="قطع في الشريحة" title="لو المنتج بيتباع شريحة كاملة: اكتب عدد القطع (سعرهم بيتحسب للقطعة × العدد)" onChange={(e) => upd(r.key, { pack: e.target.value.replace(/\D/g, "") })} disabled={r.state === "ok"} style={/شريح/.test(r.name) && !r.pack ? { borderColor: "var(--warn)", background: "#fdf4e3" } : undefined} />
                  </div>
                  {/شريح/.test(r.name) && !r.pack && <small style={{ color: "var(--warn)" }}>⚠ الاسم فيه "شريحة": اكتب عدد القطع في الشريحة علشان السعر يتحسب صح.</small>}
                  <small>سعرهم {r.base} ج.م{packOf(r) > 1 ? ` للقطعة × ${packOf(r)} = ${unitBase(r)} للشريحة` : ""} · {r.edited ? `سعر مخصوص من ${r.moq || 1} قطعة` : `عندك: ${tiersText(unitBase(r))}${packOf(r) > 1 ? " للشريحة" : ""}`} · {catName(r.cat)} · {r.imgs.length} صورة{r.src.published === 0 ? " · مش منشور عندهم" : ""}{Number(r.src.discount) > 0 ? ` · السعر قبل الخصم ${r.src.unit_price}` : ""}</small>
                </div>
                {r.state === "ok" ? <span className="bd v">{r.note || "اتضاف"}</span> : r.state === "busy" ? <span className="bd w">جاري…</span> : r.state === "err" ? <span className="bd e">{r.note}</span> : r.note ? <span className="bd w">{r.note}</span> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
