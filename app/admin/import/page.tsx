"use client";
import { useMemo, useState } from "react";
import { addDoc, collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { applyStudio, enhanceMany, studioPreview } from "@/lib/enhance";
import type { Product } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { getSettings, listApprovedMerchants, listCategories } from "@/lib/store";
import { DEFAULT_RULES, tiersFromRules } from "@/lib/pricing";
import { createSupplier, listSuppliers } from "@/lib/suppliers";
import { bestFrames, uploadImage, uploadVideo } from "@/lib/img";
import { HOUSE } from "@/lib/config";
import { analyzeProduct, cropToBox, visionText } from "@/lib/vision";

/* Imports products from a Telegram Desktop export (Export chat history → JSON, with photos and videos).
 * A product that only has a video gets its 2 sharpest frames as pictures, and the video itself is kept. */

type TgText = string | { type?: string; text?: string };
type TgMsg = { id: number; type: string; date?: string; date_unixtime?: string; text?: TgText | TgText[]; photo?: string; file?: string; mime_type?: string; media_type?: string };
type Row = { key: string; text: string; photos: string[]; videos: string[]; name: string; price: string; moq: string; on: boolean; state?: "ok" | "err" | "busy"; note?: string;
  /* from al3ataba-import.json: category per product, supplier cost per piece, pieces per carton */
  cat?: string; icon?: string; pack?: number; desc?: string;
  frames?: string[]; replace?: boolean; postedAt?: string; pid?: string /* already on the site → update it instead of adding */ };
type Manifest = { format: string; supplier?: string; items: { key: string; name: string; description: string; category: string; icon?: string; cost: number; pack: number; photos: string[]; videos: string[]; frames?: string[]; replace?: boolean; postedAt?: string }[] };

const UNITS = ["قطعة", "دستة", "كرتونة", "طقم", "علبة", "كيلو", "متر"];
const plain = (t: TgMsg["text"]): string => (Array.isArray(t) ? t.map((x) => (typeof x === "string" ? x : x.text || "")).join("") : typeof t === "string" ? t : t?.text || "");
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const clean = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/[*_~`#|]+/g, "").replace(/\s+/g, " ").trim();

/** Supplier captions are often decorated ("سـ؏ـر", "ڪرٺونة"): bring them back to plain Arabic first. */
const plainAr = (s: string) => digits(s).replace(/ـ/g, "").replace(/؏/g, "ع").replace(/ٺ/g, "ت").replace(/ڪ/g, "ك").replace(/\u00a0/g, " ");
function guessPrice(text: string): string {
  const t = plainAr(text);
  const near = t.match(/(?:سعر|السعر|بسعر|الجمل[هة]|price)[^\d]{0,15}(\d+(?:[.,]\d+)?)/i) || t.match(/(\d+(?:[.,]\d+)?)\s*(?:ج\.?\s?م|جنيه|جنية|ج(?![\u0600-\u06FF])|egp|le\b|l\.e)/i);
  if (near) return near[1].replace(",", ".");
  const line = t.split(/\n+/).map((l) => l.trim()).find((l) => /^\d+(?:[.,]\d+)?\s*(?:ج|جنيه)?\.?$/.test(l));
  return line ? line.match(/\d+(?:[.,]\d+)?/)![0].replace(",", ".") : "";
}
function guessMoq(text: string): string {
  const t = plainAr(text);
  const m = t.match(/عدد\s*(?:ال)?(?:كرتون[هة]|قطع)[^\d]{0,15}(\d+)/) || t.match(/(?:أقل|اقل|الحد الأدنى|الحد الادنى|اقل كمية|أقل كمية)[^\d]{0,15}(\d+)/) || t.match(/(?:الدست[ةه]|الكرتون[ةه])\s*(\d+)/);
  return m ? m[1] : "";
}
function guessName(text: string): string {
  const lines = text.split(/\n+/).map(clean).filter((l) => l && !/^\d+([.,]\d+)?\s*(ج|جنيه|egp)?$/i.test(digits(l)));
  return (lines[0] || "").replace(/^(اسم المنتج|المنتج|الاسم|الصنف|product)\s*[:：\-]\s*/i, "").slice(0, 90);
}

const MISSING = "(File not included";
function toRows(msgs: TgMsg[]): Row[] {
  const groups: { text: string; photos: string[]; videos: string[]; t: number; id: number }[] = [];
  for (const m of msgs) {
    if (m.type !== "message") continue;
    const photo = m.photo || (m.mime_type?.startsWith("image/") ? m.file : undefined);
    const video = m.media_type === "video_file" || m.mime_type?.startsWith("video/") ? m.file : undefined;
    const media = [photo, video].find((x) => x && !x.startsWith(MISSING));
    const text = plain(m.text).trim();
    const t = Number(m.date_unixtime) || (m.date ? Date.parse(m.date) / 1000 : 0);
    const last = groups[groups.length - 1];
    const close = last && Math.abs(t - last.t) <= 90;
    if (media) {
      const isVid = media === video;
      if (close && (!text || !last.text)) { (isVid ? last.videos : last.photos).push(media); if (text) last.text = text; last.t = t; }
      else groups.push({ text, photos: isVid ? [] : [media], videos: isVid ? [media] : [], t, id: m.id });
    } else if (text && close && !last.text) { last.text = text; }
  }
  return groups.filter((g) => g.photos.length || g.videos.length).map((g) => ({
    key: String(g.id), text: g.text, photos: g.photos.slice(0, 8), videos: g.videos.slice(0, 3),
    name: guessName(g.text), price: guessPrice(g.text), moq: guessMoq(g.text), on: true,
  }));
}

/** Telegram Desktop "HTML" export (messages.html, messages2.html…) → the same shape as result.json. */
async function htmlMessages(pages: File[]): Promise<{ title: string; msgs: TgMsg[] }> {
  const order = (f: File) => Number(f.name.match(/messages(\d*)\.html$/i)?.[1] || 1);
  const msgs: TgMsg[] = []; let title = "";
  for (const f of [...pages].sort((a, b) => order(a) - order(b))) {
    const doc = new DOMParser().parseFromString(await f.text(), "text/html");
    title ||= doc.querySelector(".page_header .text.bold")?.textContent?.trim() || "";
    doc.querySelectorAll("div.message.default").forEach((el) => {
      const id = Number(el.id.replace("message", "")); if (!id) return;
      const d = el.querySelector(".date.details")?.getAttribute("title") || "";
      const m = d.match(/(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d):(\d\d)(?: UTC([+-]\d\d):?(\d\d))?/);
      const unix = m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? `${m[7]}:${m[8]}` : "+02:00"}`) / 1000 : 0;
      const tx = el.querySelector(".text") as HTMLElement | null;
      const text = tx ? (tx.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')).trim() : "";
      const photo = el.querySelector("a.photo_wrap")?.getAttribute("href") || undefined;
      const video = el.querySelector("a.video_file_wrap")?.getAttribute("href") || undefined;
      msgs.push({ id, type: "message", date_unixtime: String(unix), text, ...(photo ? { photo } : {}), ...(video ? { file: video, media_type: "video_file" } : {}) });
    });
  }
  return { title, msgs };
}

export default function ImportTelegram() {
  const { user } = useApp();
  const cats = useAsync(listCategories, []);
  const merchants = useAsync(listApprovedMerchants, []);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("");
  const [unit, setUnit] = useState("قطعة");
  const [moq, setMoq] = useState("1");
  const [owner, setOwner] = useState(HOUSE.id);
  const [running, setRunning] = useState(false);
  const [autoPolish, setAutoPolish] = useState(true); // studio photo + professional copy right after import
  const [polishMsg, setPolishMsg] = useState("");
  const [aiCover, setAiCover] = useState(true); // white-background cover redrawn by AI, checked against the original
  const [coverMsg, setCoverMsg] = useState("");
  const [done, setDone] = useState(0);
  const [man, setMan] = useState<{ supplier: string } | null>(null);
  const [supplierName, setSupplierName] = useState(""); // supplier's prices → selling price from the site rules, carton = wholesale minimum
  const [aiVision, setAiVision] = useState(true); // Gemini looks at the photos/video: name, category, description, specs, clean main picture
  const [visionMsg, setVisionMsg] = useState(""); // folder has al3ataba-import.json (prepared list with categories + supplier prices)

  const findFile = (path: string) => {
    const name = path.split("/").pop() || path;
    const all = Array.from(files.entries());
    return files.get(path) || all.find(([k]) => k.endsWith("/" + path))?.[1] || (path.includes("/") && path.split("/").length > 2 ? undefined : all.find(([k]) => k.endsWith("/" + name))?.[1]);
  };
  const preview = useMemo(() => {
    const m = new Map<string, string>();
    rows.slice(0, 500).forEach((r) => { const f = r.photos[0] ? findFile(r.photos[0]) : undefined; if (f) m.set(r.key, URL.createObjectURL(f)); else { const v = r.videos[0] ? findFile(r.videos[0]) : undefined; if (v) m.set(r.key, URL.createObjectURL(v) + "#video"); } });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, files]);

  const pick = async (list: FileList | null) => {
    setErr(""); setRows([]); setDone(0);
    if (!list?.length) return;
    const map = new Map<string, File>();
    let json: File | undefined, prep: File | undefined; const pages: File[] = [];
    for (const f of Array.from(list)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      map.set(rel, f);
      if (/(^|\/)result\.json$/i.test(rel)) json = f;
      if (/(^|\/)al3ataba-import\.json$/i.test(rel)) prep = f;
      if (/(^|\/)messages\d*\.html$/i.test(rel) && rel.split("/").length <= 2) pages.push(f);
    }
    setMan(null);
    if (prep) {
      try {
        const d = JSON.parse(await prep.text()) as Manifest;
        let r: Row[] = d.items.map((x) => ({ key: x.key, text: x.description, desc: x.description, photos: x.photos, videos: x.videos, frames: x.frames, replace: x.replace, postedAt: x.postedAt, name: x.name, price: String(x.cost), moq: String(x.pack), on: true, cat: x.category, icon: x.icon, pack: x.pack }));
        try {
          const old = await getDocs(query(collection(dbI(), "products"), where("source", "==", "telegram")));
          const ids = new Map(old.docs.map((x) => [x.get("sourceId") as string, x.id]));
          r = r.map((x) => (ids.has(x.key) ? { ...x, pid: ids.get(x.key), note: "موجود · هيتحدّث" } : x));
        } catch { /* best-effort */ }
        setFiles(map); setRows(r); setMan({ supplier: d.supplier || "" }); setAiCover(false); setAutoPolish(false);
        return;
      } catch { return setErr("ملف al3ataba-import.json فيه مشكلة."); }
    }
    if (!json && pages.length) {
      try {
        const { title, msgs } = await htmlMessages(pages);
        let r = toRows(msgs).map((x) => {
          const g = msgs.find((m) => String(m.id) === x.key);
          return { ...x, key: /الفهد/.test(title) ? `fahd:${x.key}` : `tg:${title || "html"}:${x.key}`, postedAt: g?.date_unixtime ? new Date(Number(g.date_unixtime) * 1000).toISOString() : undefined, name: "" };
        }).filter((x) => x.price && x.moq); // posts without a price (🔥 / greetings / verses) are skipped
        try {
          const old = await getDocs(query(collection(dbI(), "products"), where("source", "==", "telegram")));
          const ids = new Map(old.docs.map((x) => [x.get("sourceId") as string, x.id]));
          r = r.map((x) => (ids.has(x.key) ? { ...x, on: false, state: "ok" as const, note: "" } : x));
        } catch { /* best-effort */ }
        setFiles(map); setRows(r.reverse()); // newest post first
        if (title && !supplierName) setSupplierName(title);
        setAiCover(false); setAutoPolish(false);
        if (!r.length) setErr("مالقيتش بوستات فيها صورة وسعر وعدد كرتونة.");
        return;
      } catch { return setErr("مقدرتش أقرا ملفات messages.html."); }
    }
    if (!json) return setErr("مش لاقي ملف result.json أو messages.html. اختار المجلد اللي Telegram صدّره.");
    try {
      const data = JSON.parse(await json.text()) as { id?: number; messages?: TgMsg[] };
      const ch = String(data.id ?? "x");
      let r = toRows(data.messages || []).map((x) => ({ ...x, key: `tg:${ch}:${x.key}` }));
      try {
        const old = await getDocs(query(collection(dbI(), "products"), where("source", "==", "telegram")));
        const seen = new Set(old.docs.map((d) => d.get("sourceId") as string));
        r = r.map((x) => (seen.has(x.key) ? { ...x, on: false, state: "ok" as const, note: "" } : x));
      } catch { /* ignore: duplicates check is best-effort */ }
      setFiles(map);
      setRows(r);
      if (!r.length) setErr("مالقيتش بوستات فيها صور. اتأكد إنك علّمت على Photos وانت بتعمل Export.");
    } catch { setErr("الملف مش بصيغة JSON صحيحة. اختار صيغة Machine-readable JSON في التصدير."); }
  };

  const upd = (key: string, v: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...v } : r)));
  const chosen = rows.filter((r) => r.on && r.state !== "ok");

  const run = async () => {
    if (!user) return;
    const c0 = cats.data?.find((x) => x.id === cat);
    const useAI = aiVision && !man; // prepared lists already have names/categories
    if (!c0 && !man && !useAI) return setErr("اختار القسم الأول (أو شغّل الذكاء الاصطناعي يختار القسم لكل منتج).");
    const m = owner === HOUSE.id ? { id: HOUSE.id, name: HOUSE.name, governorate: "القاهرة" } : merchants.data?.find((x) => x.id === owner);
    if (!m) return setErr("اختار التاجر.");
    setErr(""); setRunning(true); setVisionMsg("");
    const newIds: string[] = [];
    // supplier prices: supplier (admin-only), site markup rules; categories created when missing
    const sup = (man?.supplier || supplierName).trim();
    let rules = DEFAULT_RULES, supplierId = "";
    const catBy = new Map((cats.data ?? []).map((x) => [x.name.trim(), x]));
    if (sup) {
      try { const st = await getSettings(); if (st.markupRules?.length) rules = st.markupRules; } catch { /* defaults */ }
      try { const sp = (await listSuppliers()).find((x) => x.name.trim() === sup) ?? (await createSupplier(sup)); supplierId = sp.id; }
      catch { setRunning(false); return setErr("مقدرتش أجيب/أعمل المورد."); }
    }
    const catFor = async (name?: string, icon?: string) => {
      if (!name) return c0!;
      if (name.startsWith("id:")) { const f = cats.data?.find((x) => x.id === name.slice(3)); if (f) return f; }
      const hit = catBy.get(name.trim()); if (hit) return hit;
      const ref = await addDoc(collection(dbI(), "categories"), { name: name.trim(), icon: icon || "ph-package", order: 0, parentId: null });
      const nc = { id: ref.id, name: name.trim(), icon: icon || "ph-package", order: 0, parentId: null };
      catBy.set(nc.name, nc); return nc;
    };
    let aiOk = 0, aiBad = 0;
    for (const r of chosen) {
      const price = Number(digits(r.price));
      const q = Math.max(1, Number(digits(r.moq || moq)) || 1);
      if (!(price > 0) || (!useAI && r.name.trim().length < 2)) { upd(r.key, { state: "err", note: "ناقص اسم أو سعر" }); continue; }
      upd(r.key, { state: "busy", note: "" });
      try {
        const images: string[] = [], videos: string[] = [];
        let name = r.name.trim(), description = (r.desc ?? r.text).trim(), catName = r.cat, specs: { k: string; v: string }[] = [], colors: string[] = [];
        const media = !r.pid || r.replace; // existing product with the same photos → keep its media
        if (media && r.frames) {
          for (const p of [...r.photos, ...r.frames]) { const f = findFile(p); if (f) images.push(await uploadImage(f, user.uid, "products")); }
          for (const p of r.videos) { const f = findFile(p); if (f) try { videos.push(await uploadVideo(f)); } catch { /* too big */ } }
        } else if (media) {
          const photos = r.photos.map(findFile).filter(Boolean) as File[];
          const vids = r.videos.map(findFile).filter(Boolean) as File[];
          let covers: File[] = [];
          if (useAI) {
            // Gemini looks at up to 4 photos + 4 sharp video frames, writes the copy and picks the clean pictures
            const frames = vids[0] ? await bestFrames(vids[0], photos.length ? 2 : 4) : [];
            const pics: File[] = [...photos.slice(0, 4), ...frames];
            if (!pics.length) throw new Error("no images");
            setVisionMsg(`الذكاء الاصطناعي بيشوف "${r.key}"… (نجح ${aiOk} · اتساب ${aiBad})`);
            try {
              const v = await analyzeProduct(pics, r.text, Array.from(catBy.keys()));
              if (!v.isProduct) { upd(r.key, { state: "err", note: "مش منتج (اتساب)" }); aiBad++; continue; }
              name = v.name || name || r.text.slice(0, 60); description = visionText(v) || description; catName = v.category || catName; specs = v.specs; colors = v.colors;
              covers = await Promise.all(v.best.map((i) => cropToBox(pics[i], v.boxes[String(i)])));
              upd(r.key, { name }); aiOk++;
            } catch (e) { aiBad++; upd(r.key, { note: `الذكاء الاصطناعي: ${(e as Error).message}` }); if (!name) name = r.text.split("\n")[0].slice(0, 60) || "منتج"; }
          }
          for (const f of covers) images.push(await uploadImage(f, user.uid, "products"));
          for (const f of photos) images.push(await uploadImage(f, user.uid, "products"));
          if (!covers.length && images.length < 2 && vids[0]) for (const fr of await bestFrames(vids[0], images.length ? 1 : 2)) images.push(await uploadImage(fr, user.uid, "products"));
          for (const f of vids) try { videos.push(await uploadVideo(f)); } catch { /* too big → pictures only */ }
        }
        if (media && !images.length) throw new Error("no images");
        const c = (useAI && !catName && !c0) ? await catFor("منتجات متنوعة") : await catFor(catName, r.icon);
        // supplier price per piece → selling tiers from the site rules. The supplier's carton count is the wholesale minimum:
        // tier "1" = one carton, tier "5" = five cartons, so orders go in multiples of the carton (pricing.ts quantity steps).
        const pack = sup ? q : 1;
        const scaled = rules.map((x) => ({ ...x, tiers: x.tiers.map((t) => ({ min: Math.max(1, t.min) * pack, pct: t.pct })) }));
        const pr = sup ? tiersFromRules(price, scaled) : null;
        const tiers = pr?.tiers.length ? pr.tiers : [{ min: q, price }];
        const minQ = sup ? pack : q;
        const posted = r.postedAt && !isNaN(Date.parse(r.postedAt)) ? Timestamp.fromDate(new Date(r.postedAt)) : null; // order on the site = supplier's post date
        const extra = sup ? { basePrices: [price], markupTiers: pr?.rule?.tiers ?? [], ...(supplierId ? { supplierId } : {}), ...(posted ? { postedAt: posted } : {}) } : {};
        const kw = Array.from(new Set(`${name} ${c.name}`.toLowerCase().split(/\s+/).filter((w) => w.length > 1)));
        if (r.pid) {
          await updateDoc(doc(dbI(), "products", r.pid), {
            name, description, unit: "قطعة", moq: minQ, tiers, ...extra, packSize: deleteField(), ...(posted ? { createdAt: posted } : {}),
            ...(media ? { images, media: [...images, ...videos], videos: videos.length ? videos : deleteField() } : {}), keywords: kw,
          });
          upd(r.key, { state: "ok", note: "" }); setDone((d) => d + 1); continue;
        }
        await addDoc(collection(dbI(), "products"), {
          name, description, categoryId: c.id, categoryName: c.name, unit: sup ? "قطعة" : unit, moq: minQ,
          tiers, ...extra, governorate: m.governorate || "القاهرة", images, media: [...images, ...videos], ...(videos.length ? { videos } : {}), colors, specs,
          cod: true, madeInEgypt: false, logoPrint: false, status: "pending", // reviewed by admin before going live
          ...(useAI ? { aiCopy: true } : {}), keywords: kw,
          merchantId: m.id, merchantName: m.name, ownerUid: user.uid, source: "telegram", sourceId: r.key, createdAt: posted ?? serverTimestamp(),
        }).then((ref) => { newIds.push(ref.id); });
        upd(r.key, { state: "ok" }); setDone((d) => d + 1);
      } catch { upd(r.key, { state: "err", note: images0(r) ? "فشل الحفظ" : "الصورة مش موجودة في المجلد" }); }
    }
    if (useAI) setVisionMsg(`الذكاء الاصطناعي خلص ✓ نجح ${aiOk} · اتساب ${aiBad}`);
    setRunning(false);
    if (aiCover && newIds.length) {
      let okN = 0, skipN = 0;
      for (const [i, id] of newIds.entries()) {
        setCoverMsg(`صورة بيضا بالذكاء الاصطناعي ${i + 1}/${newIds.length} · تمت ${okN} · اتسابت ${skipN}`);
        try {
          const d = await getDoc(doc(dbI(), "products", id)); if (!d.exists()) continue;
          const p = { id, ...d.data() } as Product;
          const res = await studioPreview(user, p.images[0], "gemini", p.name, "auto", "", "white", undefined, p);
          if (res.check && !res.check.ok) { skipN++; continue; } // the AI changed the product → keep the real photos only
          await applyStudio(p, res); okN++;
        } catch { skipN++; }
      }
      setCoverMsg(`الصور البيضا خلصت ✓ تمت ${okN} · اتسابت ${skipN} (اللي اتسابت فاضلة بصورها الحقيقية)`);
    }
    if (autoPolish && newIds.length) {
      setPolishMsg(`جاري تحسين صور وأوصاف ${newIds.length} منتج… سيب الصفحة مفتوحة`);
      const list = (await Promise.all(newIds.map((id) => getDoc(doc(dbI(), "products", id))))).filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() }) as Product);
      let okN = 0, badN = 0;
      await enhanceMany(user, list, { images: "none", text: true, names: true }, (st) => { if (st.ok) okN++; else badN++; setPolishMsg(`جاري التحسين… نجح ${okN} · فشل ${badN}`); }, () => false);
      setPolishMsg(`خلص التحسين ✓ نجح ${okN} · فشل ${badN} — راجع المنتجات وانشرها`);
    }
  };
  const images0 = (r: Row) => [...r.photos, ...r.videos].some((p) => findFile(p));

  return (
    <>
      <div className="card col">
        <h3>استيراد منتجات من تليجرام</h3>
        <ol className="mu" style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.9 }}>
          <li>افتح القناة في <b>Telegram Desktop</b> على الكمبيوتر، ومن (⋮) اختار <b>Export chat history</b>.</li>
          <li>علّم على <b>Photos</b> و<b>Videos</b>، وارفع Size limit لآخره، واختار Format: <b>HTML</b> أو <b>JSON</b>، ومن From اختار التاريخ اللي عايز تبدأ منه، واضغط Export.</li>
          <li>اختار هنا المجلد اللي اتصدّر (اسمه غالباً ChatExport_…).</li>
        </ol>
        <label className="drop"><i className="ph ph-folder-open" /><b style={{ color: "var(--pd)" }}>اختار مجلد التصدير</b><small>تصدير HTML أو JSON من Telegram (فيه messages.html أو result.json ومجلدات photos و video_files)</small>
          {/* @ts-expect-error non-standard directory picker attributes */}
          <input type="file" hidden multiple webkitdirectory="" directory="" onChange={(e) => pick(e.target.files)} />
        </label>
        <small>بتأكد إن المنتجات والصور ليك أو إن صاحبها موافق إنها تتنشر على العتبة.</small>
      </div>

      {rows.length > 0 && (
        <div className="card col">
          <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 4 }}>
            {man ? <div className="fld"><label>القسم</label><div className="in" style={{ display: "flex", alignItems: "center" }}>حسب كل منتج · السعر بقواعد التسعير{man.supplier ? " · المورد محفوظ للإدارة" : ""}</div></div> : <div className="fld"><label>القسم (لكل المنتجات)</label><select className="in" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">اختار…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
            {!man && <div className="fld"><label>المورد <small>(للإدارة بس)</small></label><input className="in" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="مثال: الفهد للاستيراد" title="لو كتبت مورد: السعر المكتوب = سعر المورد للقطعة، والبيع بيتحسب بقواعد التسعير، والكمية = أقل طلب جملة ومضاعفاتها" /></div>}
            <div className="fld"><label>تنزل باسم</label><select className="in" value={owner} onChange={(e) => setOwner(e.target.value)}><option value={HOUSE.id}>العتبة (الإدارة)</option>{merchants.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div className="fld"><label>الوحدة</label><select className="in" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
            <div className="fld"><label>أقل كمية (لو مش مكتوبة)</label><input className="in" inputMode="numeric" value={moq} onChange={(e) => setMoq(e.target.value.replace(/\D/g, ""))} /></div>
          </div>
          <div className="row wrap">
            <b className="sp">{rows.length} منتج اتلقى · {chosen.length} متعلّم · {done} اتضاف للمراجعة</b>
              {!man && <label className="chk" title="Gemini بيشوف صور وفيديو كل منتج: يكتب الاسم والوصف والمواصفات ويختار القسم، ويختار أوضح صورة من غير كلام ويقصها كصورة رئيسية"><input type="checkbox" checked={aiVision} onChange={(e) => setAiVision(e.target.checked)} />الذكاء الاصطناعي يشوف الصور والفيديو (اسم · قسم · وصف · مواصفات · صورة رئيسية نضيفة)</label>}
              {visionMsg && <span className="ok" style={{ width: "100%" }}><i className="ph ph-eye" /> {visionMsg}</span>}
              <label className="chk" title="اسم ووصف احترافي بعد الاستيراد على طول"><input type="checkbox" checked={autoPolish} onChange={(e) => setAutoPolish(e.target.checked)} />حسّن الاسم والوصف تلقائياً</label>
              <label className="chk" title="صورة رئيسية للمنتج على خلفية بيضا، والذكاء الاصطناعي بيقارنها بالأصل قبل ما تتحط"><input type="checkbox" checked={aiCover} onChange={(e) => setAiCover(e.target.checked)} />صورة رئيسية بخلفية بيضا</label>
              {coverMsg && <span className="ok" style={{ width: "100%" }}><i className="ph ph-image" /> {coverMsg}</span>}
              {polishMsg && <span className="ok" style={{ width: "100%" }}><i className="ph ph-magic-wand" /> {polishMsg}</span>}
              {done > 0 && !running && <a className="btn gd sm2" href="/admin/products?f=pending"><i className="ph ph-eye" />راجعهم وانشرهم</a>}
            <button className="btn o sm2" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, on: true })))}>علّم الكل</button>
            <button className="btn o sm2" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, on: false })))}>شيل الكل</button>
            <button className="btn" disabled={running || !chosen.length} onClick={run}>{running ? `جاري الإضافة… ${done}` : `إضافة ${chosen.length} منتج`}</button>
          </div>
          {err && <div className="alert e">{err}</div>}
          <small>راجع الاسم والسعر قبل الإضافة. السعر والكمية بيتطلعوا تلقائي من النص لو مكتوبين، والنص كله بيتحط في وصف المنتج.</small>
        </div>
      )}
      {err && !rows.length && <div className="alert e">{err}</div>}

      <div className="col">
        {rows.slice(0, 500).map((r) => (
          <div key={r.key} className="card row wrap" style={{ alignItems: "flex-start", opacity: r.on ? 1 : 0.55, borderColor: r.state === "ok" ? "var(--ok)" : r.state === "err" ? "var(--err)" : undefined }}>
            <input type="checkbox" checked={r.on} disabled={r.state === "ok"} onChange={(e) => upd(r.key, { on: e.target.checked })} style={{ width: 20, height: 20, accentColor: "var(--pa)", marginTop: 18 }} aria-label="اختيار" />
            <div style={{ position: "relative", flex: "none" }}>
              {preview.get(r.key)?.endsWith("#video") ? <video src={preview.get(r.key)!.replace(/#video$/, "")} muted playsInline preload="metadata" className="ph-thumb" style={{ width: 76, height: 76, objectFit: "cover" }} />
                : preview.get(r.key) ? <img src={preview.get(r.key)} alt="" className="ph-thumb" style={{ width: 76, height: 76 }} /> : <span className="ph-thumb" style={{ width: 76, height: 76, display: "grid", placeItems: "center" }}><i className="ph ph-image-broken" /></span>}
              {r.photos.length + r.videos.length > 1 && <span className="bd" style={{ position: "absolute", bottom: 4, insetInlineStart: 4 }}>{r.photos.length + r.videos.length}</span>}
              {r.videos.length > 0 && <span className="bd v" style={{ position: "absolute", top: 4, insetInlineStart: 4 }}><i className="ph ph-video" /></span>}
            </div>
            <div className="sp col g8" style={{ minWidth: 220 }}>
              <input className="in" value={r.name} placeholder="اسم المنتج" onChange={(e) => upd(r.key, { name: e.target.value })} disabled={r.state === "ok"} />
              <div className="row">
                <input className="in" inputMode="decimal" value={r.price} placeholder={man ? "سعر القطعة من المورد" : "السعر ج.م"} title={man ? "سعر القطعة من المورد (البيع بيتحسب بقواعد التسعير)" : undefined} onChange={(e) => upd(r.key, { price: e.target.value })} disabled={r.state === "ok"} />
                <input className="in" inputMode="numeric" value={r.moq} placeholder={man ? "أقل طلب جملة" : `أقل كمية (${moq})`} onChange={(e) => upd(r.key, { moq: e.target.value })} disabled={r.state === "ok"} />
              </div>
              {r.cat && <small className="mu"><i className="ph ph-tag" /> {r.cat.startsWith("id:") ? "إكسسوارات موبايل" : r.cat} · أقل طلب {r.pack} قطعة ومضاعفاتها{r.postedAt ? ` · نزل ${r.postedAt.slice(0, 10)}` : ""}</small>}
              {r.text && <small style={{ whiteSpace: "pre-wrap", maxHeight: 64, overflow: "hidden" }}>{r.text}</small>}
            </div>
            {r.state === "ok" ? <span className="bd v">{r.pid ? "اتحدّث ✓" : "موجود على الموقع"}</span> : r.state === "busy" ? <span className="bd w">جاري…</span> : r.state === "err" ? <span className="bd e">{r.note}</span> : r.pid ? <span className="bd w">موجود · هيتحدّث</span> : null}
          </div>
        ))}
        {rows.length > 500 && <div className="alert">بيظهر أول 500 بوست بس. استورد دول، وبعدين اختار المجلد تاني وشيل علامة اللي اتضافوا.</div>}
      </div>
    </>
  );
}
