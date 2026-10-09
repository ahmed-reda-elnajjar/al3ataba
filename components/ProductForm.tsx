"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { listCategories } from "@/lib/store";
import { isLowQuality, uploadImage, uploadVideo, videoPoster } from "@/lib/img";
import { COLORS, swatch } from "@/lib/colors";
import { useDragSort } from "@/lib/dnd";
import { GOVERNORATES, HOUSE } from "@/lib/config";
import type { Product, Tier } from "@/lib/types";

const UNITS = ["قطعة", "كرتونة", "دستة", "كيس", "كيلو", "طن", "متر", "طقم", "علبة", "باليت"];

export function ProductForm({ id, back }: { id?: string; back: string }) {
  const { user, isAdmin, merchant } = useApp();
  const router = useRouter();
  const cats = useAsync(listCategories, []);
  const existing = useAsync(async () => {
    if (!id) return null;
    const s = await getDoc(doc(dbI(), "products", id));
    return s.exists() ? ({ id: s.id, ...s.data() } as Product) : null;
  }, [id]);
  if (id && existing.loading) return <div className="skel" />;
  if (id && !existing.data) return <div className="alert e">المنتج مش موجود.</div>;
  return <Inner key={id ?? "new"} p={existing.data ?? null} cats={cats.data ?? []} back={back} user={user?.uid ?? ""} isAdmin={isAdmin} merchant={merchant} router={router} />;
}

type Cat = { id: string; name: string };
function Inner({ p, cats, back, user, isAdmin, merchant, router }: { p: Product | null; cats: Cat[]; back: string; user: string; isAdmin: boolean; merchant: ReturnType<typeof useApp>["merchant"]; router: ReturnType<typeof useRouter> }) {
  const [name, setName] = useState(p?.name ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [categoryId, setCategoryId] = useState(p?.categoryId ?? "");
  const [unit, setUnit] = useState(p?.unit ?? "قطعة");
  const [moq, setMoq] = useState(String(p?.moq ?? 1));
  const [tiers, setTiers] = useState<{ min: string; price: string }[]>(p?.tiers?.map((t) => ({ min: String(t.min), price: String(t.price) })) ?? [{ min: "1", price: "" }]);
  const [governorate, setGov] = useState(p?.governorate ?? merchant?.governorate ?? "القاهرة");
  const [images, setImages] = useState<string[]>(p?.images ?? []);
  const [videos, setVideos] = useState<string[]>(p?.videos ?? []);
  const [upMsg, setUpMsg] = useState("");
  const [colors, setColors] = useState<string[]>(p?.colors ?? []);
  const [colorIn, setColorIn] = useState("");
  const addColor = (c: string) => { const v = c.trim(); if (v && !colors.includes(v)) setColors([...colors, v]); setColorIn(""); };
  const [specs, setSpecs] = useState<{ k: string; v: string }[]>(p?.specs?.length ? p.specs : []);
  const [cod, setCod] = useState(p?.cod ?? true);
  const [made, setMade] = useState(p?.madeInEgypt ?? true);
  const [logo, setLogo] = useState(p?.logoPrint ?? false);
  const [status, setStatus] = useState<Product["status"]>(p?.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const imgDnd = useDragSort<string>(images, (u) => u, (next) => setImages(next));
  const move = (from: number, to: number) => setImages((xs) => { if (to < 0 || to >= xs.length || from === to) return xs; const a = [...xs]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  const [err, setErr] = useState("");

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setUp(true); setErr("");
    const all = Array.from(files);
    const imgs = all.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, 8 - images.length));
    const vids = all.filter((f) => f.type.startsWith("video/")).slice(0, Math.max(0, 3 - videos.length));
    const errs: string[] = [];
    let n = 0;
    for (const f of imgs) {
      setUpMsg(`جاري رفع الصور… ${++n}/${imgs.length + vids.length}`);
      try { const u = await uploadImage(f, user, "products"); setImages((x) => [...x, u].slice(0, 8)); } catch { errs.push(`تعذّر رفع ${f.name}`); }
    }
    for (const f of vids) {
      setUpMsg(`جاري رفع الفيديو… ${++n}/${imgs.length + vids.length} (ممكن ياخد دقيقة)`);
      try { const u = await uploadVideo(f); setVideos((x) => [...x, u].slice(0, 3)); }
      catch (e) { const m = (e as Error).message; errs.push(m === "too-big" ? `${f.name}: الفيديو أكبر من 100 ميجا` : `تعذّر رفع الفيديو ${f.name}`); }
    }
    if (all.some((f) => f.type.startsWith("video/")) && videos.length + vids.length >= 3 && all.filter((f) => f.type.startsWith("video/")).length > vids.length) errs.push("الحد 3 فيديوهات للمنتج.");
    if (errs.length) setErr(errs.join(" · "));
    setUpMsg(""); setUp(false);
  };

  const save = async () => {
    setErr("");
    const t: Tier[] = tiers.map((x) => ({ min: Number(x.min), price: Number(x.price) })).filter((x) => x.min > 0 && x.price > 0);
    if (name.trim().length < 3) return setErr("اكتب اسم المنتج.");
    if (!categoryId) return setErr("اختار القسم.");
    if (!t.length) return setErr("حط سعر واحد على الأقل.");
    if (!images.length) return setErr("ارفع صورة واحدة على الأقل (الفيديو لوحده مش كفاية، الصورة هي اللي بتظهر في الكارت).");
    const inline = images.filter((u) => u.startsWith("data:")).reduce((a, u) => a + u.length, 0);
    if (inline > 850_000) return setErr("الصور حجمها كبير على قاعدة البيانات (Storage مش مفعّل). احذف صورة أو اتنين وجرّب تاني، أو فعّل Storage في Firebase.");
    const m = Math.max(1, Number(moq) || 1);
    const cat = cats.find((c) => c.id === categoryId);
    const owner = isAdmin && !p ? HOUSE : p ? { id: p.merchantId, name: p.merchantName } : { id: user, name: merchant?.name ?? "" };
    const data = {
      name: name.trim(), description: description.trim(), categoryId, categoryName: cat?.name ?? "",
      unit, moq: m, tiers: t.sort((a, b) => a.min - b.min), governorate,
      images, videos, colors: colorIn.trim() && !colors.includes(colorIn.trim()) ? [...colors, colorIn.trim()] : colors,
      specs: specs.filter((s) => s.k.trim() && s.v.trim()), cod, madeInEgypt: made, logoPrint: logo,
      status: isAdmin ? status : (p?.status ?? "active"),
      keywords: Array.from(new Set(`${name} ${cat?.name ?? ""}`.toLowerCase().split(/\s+/).filter((w) => w.length > 1))),
    };
    setBusy(true);
    try {
      const write = p ? updateDoc(doc(dbI(), "products", p.id), { ...data, updatedAt: serverTimestamp() })
        : addDoc(collection(dbI(), "products"), { ...data, merchantId: owner.id, merchantName: owner.name, ownerUid: user, createdAt: serverTimestamp() });
      await Promise.race([write, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout" }), 60000))]);
      router.push(back);
    } catch (e) {
      const c = (e as { code?: string })?.code || "";
      setErr(c.includes("permission") ? "مرفوض: قواعد Firestore مش منشورة أو إنت مش داخل بإيميل الأدمن بجوجل."
        : c === "timeout" ? "الحفظ أخد وقت طويل. افتح قائمة المنتجات واتأكد إنه ماتحفظش قبل ما تحاول تاني، وجرّب صور أقل أو نت أسرع."
        : `ماقدرناش نحفظ المنتج${c ? ` (${c})` : ""}.`);
      setBusy(false);
    }
  };

  return (
    <div className="card col" style={{ gap: 16 }}>
      <h3>{p ? "تعديل المنتج" : "إضافة منتج جديد"}</h3>
      {images.some(isLowQuality) && <div className="alert w">الصور اتحفظت بجودة منخفضة لأن مفيش مكان تخزين صور مفعّل (Firebase Storage أو Cloudinary). فعّل واحد منهم والصور هتترفع بجودتها الأصلية.</div>}
      <div className="fld"><label>صور وفيديوهات المنتج <small>— الأولى هي اللي بتظهر في الكارت. اسحب الصورة أو استخدم الأسهم لترتيبها، والنجمة تخليها الرئيسية.</small></label>
        {images.length === 0 && videos.length === 0 && <label className="drop" style={{ minHeight: 150 }}><i className="ph ph-camera" /><b style={{ color: "var(--pd)" }}>{up ? upMsg || "جاري الرفع…" : "إضافة صور وفيديوهات المنتج"}</b><small>حتى 8 صور و3 فيديوهات (الفيديو لحد 100 ميجا)</small><input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} /></label>}
        <div className="thumbs">
          {imgDnd.list.map((u, i) => (
            <div key={u.slice(-40)} className="t sortable" {...imgDnd.item(u)}>
              <img src={u} alt="" draggable={false} {...imgDnd.handle(u)} />
              {i === 0 && <span className="main">الرئيسية</span>}
              <button type="button" aria-label="حذف" onClick={() => setImages(images.filter((x) => x !== u))}>×</button>
              <div className="mv">
                <button type="button" aria-label="لقدّام" disabled={i === 0} onClick={() => move(i, i - 1)}><i className="ph ph-caret-right" /></button>
                {i > 0 && <button type="button" aria-label="اجعلها الرئيسية" onClick={() => move(i, 0)}><i className="ph ph-star" /></button>}
                <button type="button" aria-label="لورا" disabled={i === images.length - 1} onClick={() => move(i, i + 1)}><i className="ph ph-caret-left" /></button>
              </div>
            </div>
          ))}
          {videos.map((v) => (
            <div key={v} className="t vid">
              <video src={v} poster={videoPoster(v)} muted playsInline preload="metadata" />
              <span className="main" style={{ background: "var(--pd)" }}><i className="ph ph-play" style={{ fontSize: 11 }} /> فيديو</span>
              <button type="button" aria-label="حذف الفيديو" onClick={() => setVideos(videos.filter((x) => x !== v))}>×</button>
            </div>
          ))}
          {(images.length > 0 || videos.length > 0) && (images.length < 8 || videos.length < 3) && <label className="btn o" style={{ width: 104, height: 104, flexDirection: "column", padding: 0, minHeight: 0, whiteSpace: "normal" }}><i className="ph ph-camera-plus" /><small>{up ? "..." : "صورة / فيديو"}</small><input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} /></label>}
        </div>
      </div>
      <div className="fld"><label>اسم المنتج</label><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: كوبايات زجاج 250 مل" /></div>
      <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 3 }}>
        <div className="fld"><label>القسم</label><select className="in" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">اختار…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="fld"><label>وحدة البيع</label><select className="in" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
        <div className="fld"><label>أقل كمية للطلب</label><input className="in" inputMode="numeric" value={moq} onChange={(e) => setMoq(e.target.value.replace(/\D/g, ""))} /></div>
      </div>
      <div className="fld"><label>تسعير بالكمية (كل ما الكمية تزيد السعر يقل)</label>
        {tiers.map((t, i) => (
          <div key={i} className="row">
            <input className="in" inputMode="numeric" placeholder="من كمية" value={t.min} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, min: e.target.value.replace(/\D/g, "") } : x)))} />
            <input className="in" inputMode="decimal" placeholder="السعر للوحدة (ج.م)" value={t.price} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)))} />
            {tiers.length > 1 && <button type="button" className="btn r sm2" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>حذف</button>}
          </div>
        ))}
        {tiers.length < 5 && <button type="button" className="btn o sm2" style={{ alignSelf: "flex-start" }} onClick={() => setTiers([...tiers, { min: "", price: "" }])}>+ شريحة سعر</button>}
      </div>
      <div className="fld"><label>الوصف</label><textarea className="in" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 2 }}>
        <div className="fld"><label>المحافظة</label><select className="in" value={governorate} onChange={(e) => setGov(e.target.value)}>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
      </div>
      <div className="fld"><label>الألوان المتاحة <small>— كل لون لوحده، والعميل بيختار منهم</small></label>
        {colors.length > 0 && <div className="row g8 wrap">{colors.map((c, i) => (
          <span key={c} className="chip on" style={{ paddingInlineEnd: 6 }}>
            <span className="sw" style={{ background: swatch(c) || "var(--cream)" }} />{c}
            {i > 0 && <button type="button" className="cx" aria-label="لقدّام" onClick={() => { const a = [...colors]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setColors(a); }}><i className="ph ph-caret-right" /></button>}
            <button type="button" className="cx" aria-label={`حذف ${c}`} onClick={() => setColors(colors.filter((x) => x !== c))}><i className="ph ph-x" /></button>
          </span>))}</div>}
        <div className="row">
          <input className="in" value={colorIn} placeholder="اكتب لون واضغط إضافة (مثال: كحلي)" onChange={(e) => setColorIn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "," || e.key === "،") { e.preventDefault(); addColor(colorIn); } }} />
          <button type="button" className="btn o" onClick={() => addColor(colorIn)}>إضافة</button>
        </div>
        <div className="row g4 wrap">{COLORS.filter(([n]) => !colors.includes(n)).map(([n, h]) => (
          <button key={n} type="button" className="chip" style={{ minHeight: 32, fontSize: 13, padding: "0 10px" }} onClick={() => addColor(n)}><span className="sw" style={{ background: h }} />{n}</button>
        ))}</div>
      </div>
      <div className="fld"><label>المواصفات</label>
        {specs.map((s, i) => (
          <div key={i} className="row">
            <input className="in" placeholder="الخاصية" value={s.k} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
            <input className="in" placeholder="القيمة" value={s.v} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
            <button type="button" className="btn r sm2" onClick={() => setSpecs(specs.filter((_, j) => j !== i))}>حذف</button>
          </div>
        ))}
        {specs.length < 12 && <button type="button" className="btn o sm2" style={{ alignSelf: "flex-start" }} onClick={() => setSpecs([...specs, { k: "", v: "" }])}>+ مواصفة</button>}
      </div>
      <div className="row wrap g24">
        <label className="chk"><input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} />الدفع عند الاستلام متاح</label>
        <label className="chk"><input type="checkbox" checked={made} onChange={(e) => setMade(e.target.checked)} />صناعة مصرية</label>
        <label className="chk"><input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} />طباعة لوجو</label>
      </div>
      {isAdmin && <div className="fld" style={{ maxWidth: 240 }}><label>الحالة</label><select className="in" value={status} onChange={(e) => setStatus(e.target.value as Product["status"])}><option value="active">منشور</option><option value="pending">قيد المراجعة</option><option value="hidden">مخفي</option></select></div>}
      {err && <div className="alert e">{err}</div>}
      <div className="row"><button className="btn" disabled={busy || up} onClick={save}>{up ? (upMsg || "استنى، الملفات بتترفع…") : busy ? "جاري الحفظ…" : "حفظ المنتج"}</button><button className="btn o" type="button" onClick={() => router.push(back)}>إلغاء</button></div>
    </div>
  );
}
