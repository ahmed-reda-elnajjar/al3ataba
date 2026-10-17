"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { withId } from "@/lib/store";
import { sized } from "@/lib/media";
import { norm } from "@/components/SearchBox";
import { applyStudio, enhanceMany, isStudio, restoreImagesMany, studioPreview, undoEnhance, type StudioResult, type Step } from "@/lib/enhance";
import type { Product } from "@/lib/types";

type Prev = { state: "busy" | "ready" | "err" | "saved" | "skip"; res?: StudioResult; error?: string };

/* Pick a category / products → AI studio photos (preview + approve) and professional descriptions. */
export default function EnhancePage() {
  const { user } = useApp();
  const { data, loading, reload } = useAsync(async () => (await getDocs(collection(dbI(), "products"))).docs.map((d) => withId<Product>(d)), []);
  const all = useMemo(() => data ?? [], [data]);

  // ---- picker
  const cats = useMemo(() => Array.from(new Map(all.map((p) => [p.categoryId, p.categoryName])).entries()).sort((a, b) => a[1].localeCompare(b[1], "ar")), [all]);
  const [cat, setCat] = useState("");
  const [flt, setFlt] = useState<"all" | "noimg" | "notext" | "pending">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const shown = useMemo(() => {
    const n = norm(q);
    return all.filter((p) => (!cat || p.categoryId === cat) && (!n || norm(p.name).includes(n))
      && (flt === "all" || (flt === "noimg" && !p.studio) || (flt === "notext" && !p.aiCopy) || (flt === "pending" && p.status === "pending")));
  }, [all, cat, flt, q]);
  const chosen = all.filter((p) => sel.includes(p.id));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // ---- studio photos (preview → approve)
  const [prev, setPrev] = useState<Record<string, Prev>>({});
  const [mode, setMode] = useState<"extract" | "gemini">("extract");
  const stopRef = useRef(false);
  const [running, setRunning] = useState("");
  const runStudio = async () => {
    if (!user || !chosen.length) return;
    stopRef.current = false; setRunning("studio");
    const queue = chosen.filter((p) => p.images?.[0]);
    setPrev((o) => ({ ...o, ...Object.fromEntries(queue.map((p) => [p.id, { state: "busy" } as Prev])) }));
    const work = async () => {
      while (queue.length && !stopRef.current) {
        const p = queue.shift()!;
        const src = p.imagesOrig?.[0] || p.images!.find((u) => !isStudio(u)) || p.images![0]; // always start from the original photo
        try { const res = await studioPreview(user, src, mode, `${p.name} ${p.categoryName}`); setPrev((o) => ({ ...o, [p.id]: { state: "ready", res } })); }
        catch (e) { setPrev((o) => ({ ...o, [p.id]: { state: "err", error: String((e as Error).message) } })); }
      }
    };
    await Promise.all([work(), work(), work()]);
    setRunning("");
  };
  const retry = async (p: Product, variant: "auto" | "product" | "boxed", prompt = "") => {
    if (!user) return;
    const src = p.imagesOrig?.[0] || p.images!.find((u) => !isStudio(u)) || p.images![0];
    setPrev((o) => ({ ...o, [p.id]: { state: "busy" } }));
    try { const res = await studioPreview(user, src, "extract", `${p.name} ${p.categoryName}`, variant, prompt); setPrev((o) => ({ ...o, [p.id]: { state: "ready", res } })); }
    catch (e) { setPrev((o) => ({ ...o, [p.id]: { state: "err", error: String((e as Error).message) } })); }
  };
  const approve = async (p: Product) => {
    const pr = prev[p.id]; if (!pr?.res) return;
    try { await applyStudio(p, pr.res); setPrev((o) => ({ ...o, [p.id]: { ...pr, state: "saved" } })); }
    catch (e) { setPrev((o) => ({ ...o, [p.id]: { ...pr, state: "err", error: "فشل الحفظ: " + String((e as Error).message) } })); }
  };
  const approveAll = async () => { for (const p of all) if (prev[p.id]?.state === "ready") await approve(p); reload(); };
  const reject = (id: string) => setPrev((o) => ({ ...o, [id]: { state: "skip" } }));
  const previews = all.filter((p) => prev[p.id] && prev[p.id].state !== "skip");
  const readyN = previews.filter((p) => prev[p.id].state === "ready").length;

  // ---- descriptions
  const [names, setNames] = useState(true);
  const [log, setLog] = useState<Step[]>([]);
  const runText = async () => {
    if (!user || !chosen.length) return;
    stopRef.current = false; setRunning("text"); setLog([]);
    const list = chosen.map((p) => ({ ...p, aiCopy: false })); // re-do even if done before (user chose them)
    await enhanceMany(user, list, { images: "none", text: true, names }, (s) => setLog((l) => [s, ...l].slice(0, 300)), () => stopRef.current);
    setRunning(""); reload();
  };

  // ---- restore
  const studioList = all.filter((p) => p.studio && p.imagesOrig?.length);
  const [restoring, setRestoring] = useState("");
  const restoreAll = async () => {
    if (!confirm(`ترجيع الصور الأصلية لـ ${studioList.length} منتج؟`)) return;
    setRestoring("جاري الترجيع…");
    const n = await restoreImagesMany(studioList, (k) => setRestoring(`اترجع ${k}…`));
    setRestoring(`اترجعت الصور الأصلية لـ ${n} منتج ✓`); reload();
  };

  return (
    <>
      <div className="card col" style={{ gap: 8 }}>
        <h3><i className="ph ph-magic-wand" style={{ color: "var(--gold)" }} /> تحسين الصور والأوصاف</h3>
        <small>اختار قسم أو منتجات بعينها. <b>صور استوديو:</b> نفس المنتج على خلفية استوديو (حيطة فاتحة + ترابيزة بيج) من غير الكلام والرسومات اللي على الصورة، والكلام المفيد (زي 30W، Type-C) بيتقري ويتضاف لمواصفات المنتج. كل صورة بتشوفها قبل ما تتحفظ. <b>الأوصاف:</b> صياغة احترافية في نقاط.</small>
      </div>

      {/* picker */}
      <div className="card col" style={{ gap: 10 }}>
        <div className="row wrap g8">
          <select className="in" style={{ maxWidth: 240 }} value={cat} onChange={(e) => { setCat(e.target.value); }}>
            <option value="">كل الأقسام</option>
            {cats.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          <input className="in sp" style={{ minWidth: 160 }} placeholder="ابحث بالاسم…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row wrap g8">
          {([["all", "الكل"], ["noimg", "صورها ماتحسنتش"], ["notext", "وصفها ماتحسنش"], ["pending", "مستني المراجعة"]] as const).map(([k, t]) => <button key={k} className={`chip${flt === k ? " on" : ""}`} onClick={() => setFlt(k)}>{t}</button>)}
        </div>
        <div className="row wrap g8">
          <button className="btn o sm2" onClick={() => setSel(Array.from(new Set([...sel, ...shown.map((p) => p.id)])))}>علّم المعروض ({shown.length})</button>
          <button className="btn o sm2" onClick={() => setSel([])}>شيل العلامات</button>
          <b className="sp">{sel.length} منتج مختار</b>
        </div>
        <div className="pick" style={{ maxHeight: 360 }}>
          {loading ? <small style={{ padding: 12, display: "block" }}>جاري التحميل…</small> : shown.slice(0, 300).map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.images?.[0] ? <img src={sized(p.images[0], 80)} alt="" /> : <i className="ph ph-package" />}
              <span className="sp" style={{ minWidth: 0 }}>{p.name}<br /><small>{p.categoryName}{p.studio ? " · صورة استوديو ✓" : ""}{p.aiCopy ? " · وصف ✓" : ""}</small></span>
            </label>
          ))}
          {!loading && !shown.length && <small style={{ padding: 12, display: "block" }}>مفيش منتجات.</small>}
        </div>
      </div>

      {/* actions */}
      <div className="card col" style={{ gap: 12 }}>
        <div className="row wrap g8">
          <b style={{ minWidth: 90 }}>صور استوديو:</b>
          <button className={`chip${mode === "extract" ? " on" : ""}`} onClick={() => setMode("extract")}>قص المنتج بالذكاء الاصطناعي (مُستحسن)</button>
          <button className={`chip${mode === "gemini" ? " on" : ""}`} onClick={() => setMode("gemini")}>إعادة رسم بـ Gemini (محتاج تفعيل الدفع)</button>
          <span className="sp" />
          <button className="btn" disabled={!!running || !sel.length} onClick={runStudio}><i className="ph ph-image" />جهّز المعاينة ({sel.length})</button>
        </div>
        <div className="row wrap g8">
          <b style={{ minWidth: 90 }}>الأوصاف:</b>
          <label className="chk"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} />وتحسين الاسم كمان</label>
          <span className="sp" />
          <button className="btn" disabled={!!running || !sel.length} onClick={runText}><i className="ph ph-text-aa" />أعد صياغة الوصف ({sel.length})</button>
        </div>
        {running && <div className="row"><span className="sp mu">شغال… سيب الصفحة مفتوحة.</span><button className="btn r sm2" onClick={() => { stopRef.current = true; }}>إيقاف</button></div>}
      </div>

      {/* studio previews */}
      {previews.length > 0 && (
        <div className="card col" style={{ gap: 10, borderColor: "var(--gold)" }}>
          <div className="row wrap"><b className="sp">معاينة صور الاستوديو</b>{readyN > 0 && <button className="btn sm2" onClick={approveAll}><i className="ph ph-check" />اعتمد الكل ({readyN})</button>}</div>
          <small className="mu">بص على كل صورة: لو المنتج اتغيّر أو حاجة ناقصة دوس "ارفض". مفيش حاجة بتتحفظ غير لما تعتمد. لما تعتمد، الصورة الجديدة بتبقى الصورة الرئيسية والصور الأصلية بتفضل موجودة بعدها في المعرض.</small>
          <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 2, gap: 12 }}>
            {previews.map((p) => { const pr = prev[p.id]; return (
              <div key={p.id} className="col" style={{ border: "1px solid var(--bd)", borderRadius: 14, padding: 10, gap: 8, background: pr.state === "saved" ? "#f3f8f5" : undefined }}>
                <b style={{ fontSize: 14 }}>{p.name}</b>
                <div className="row" style={{ gap: 8 }}>
                  <figure style={{ margin: 0, flex: 1, textAlign: "center" }}><img src={sized(p.imagesOrig?.[0] || p.images?.[0], 400)} alt="قبل" style={{ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 10, background: "#fff" }} /><figcaption className="mu" style={{ fontSize: 12 }}>قبل</figcaption></figure>
                  <figure style={{ margin: 0, flex: 1, textAlign: "center" }}>
                    {pr.state === "busy" ? <div className="skel" style={{ width: "100%", aspectRatio: "1" }} /> : pr.res ? <img src={sized(pr.res.image, 400)} alt="بعد" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} /> : <div className="alert e" style={{ aspectRatio: "1", display: "grid", placeItems: "center", fontSize: 13 }}>{pr.error}</div>}
                    <figcaption className="mu" style={{ fontSize: 12 }}>بعد{pr.res ? (pr.res.method === "ai" ? " (Gemini)" : " (قص المنتج)") : ""}</figcaption>
                  </figure>
                </div>
                {pr.state !== "busy" && pr.state !== "saved" && (
                  <div className="row wrap g4" style={{ fontSize: 13 }}>
                    <span className="mu">ناقصة؟ جرّب:</span>
                    <button className="chip" style={{ minHeight: 30, fontSize: 12.5 }} onClick={() => retry(p, "product")}>المنتج بس</button>
                    <button className="chip" style={{ minHeight: 30, fontSize: 12.5 }} onClick={() => retry(p, "boxed")}>المنتج مع العلبة</button>
                    <button className="chip" style={{ minHeight: 30, fontSize: 12.5 }} onClick={() => { const w = prompt("اكتب بالإنجليزي اللي عايز يتقص (مثال: black wireless earbuds and case):", pr.res?.cut || ""); if (w) retry(p, "auto", w); }}>كلمات مخصوصة…</button>
                    {pr.res?.cut && <small className="mu" style={{ width: "100%" }}>اتقص: {pr.res.cut}</small>}
                  </div>
                )}
                {pr.res && pr.res.specs.length > 0 && <small><b>اتقري من الصورة:</b> {pr.res.specs.map((s) => `${s.k}: ${s.v}`).join(" · ")}</small>}
                <div className="row g8">
                  {pr.state === "ready" && <><button className="btn sm2" onClick={() => approve(p)}><i className="ph ph-check" />اعتمد</button><button className="btn o sm2" onClick={() => reject(p.id)}>ارفض</button></>}
                  {pr.state === "saved" && <><span className="bd v">اتحفظت ✓</span><Link className="btn o sm2" href={`/product/${p.id}`} target="_blank">عرض</Link></>}
                  {pr.state === "err" && <button className="btn o sm2" onClick={() => reject(p.id)}>إخفاء</button>}
                </div>
              </div>
            ); })}
          </div>
        </div>
      )}

      {/* text log */}
      {log.length > 0 && (
        <div className="col">
          {log.map((s, i) => (
            <div key={i} className="card row wrap" style={{ borderColor: s.ok ? undefined : "var(--err)" }}>
              <div className="sp" style={{ minWidth: 180 }}><b>{s.name}</b><br /><small style={{ color: s.ok ? undefined : "var(--err)" }}>{s.note}</small></div>
              {s.id !== "-" && <Link className="btn o sm2" href={`/product/${s.id}`} target="_blank">عرض</Link>}
              {s.ok && s.note.includes("الوصف") && <button className="btn o sm2" onClick={async () => { const p = all.find((x) => x.id === s.id); if (p) { await undoEnhance(p, "text"); reload(); } }}>رجّع الوصف</button>}
            </div>
          ))}
        </div>
      )}

      {/* restore */}
      {studioList.length > 0 && (
        <div className="card row wrap">
          <span className="sp">{studioList.length} منتج صورهم متغيرة — الأصل محفوظ.</span>
          <button className="btn r sm2" onClick={restoreAll}><i className="ph ph-arrow-counter-clockwise" />رجّع كل الصور الأصلية</button>
          {restoring && <span className="ok" style={{ width: "100%" }}>{restoring}</span>}
        </div>
      )}
    </>
  );
}
