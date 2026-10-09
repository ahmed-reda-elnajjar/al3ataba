"use client";
import { useMemo, useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { listApprovedMerchants, listCategories } from "@/lib/store";
import { uploadImage } from "@/lib/img";
import { HOUSE } from "@/lib/config";

/* Imports products from a Telegram Desktop export (Export chat history → JSON, with photos). */

type TgText = string | { type?: string; text?: string };
type TgMsg = { id: number; type: string; date?: string; date_unixtime?: string; text?: TgText | TgText[]; photo?: string; file?: string; mime_type?: string };
type Row = { key: string; text: string; photos: string[]; name: string; price: string; moq: string; on: boolean; state?: "ok" | "err" | "busy"; note?: string };

const UNITS = ["قطعة", "دستة", "كرتونة", "طقم", "علبة", "كيلو", "متر"];
const plain = (t: TgMsg["text"]): string => (Array.isArray(t) ? t.map((x) => (typeof x === "string" ? x : x.text || "")).join("") : typeof t === "string" ? t : t?.text || "");
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const clean = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/[*_~`#|]+/g, "").replace(/\s+/g, " ").trim();

function guessPrice(text: string): string {
  const t = digits(text);
  const near = t.match(/(?:سعر|السعر|بسعر|الجمل[هة]|price)[^\d]{0,15}(\d+(?:[.,]\d+)?)/i) || t.match(/(\d+(?:[.,]\d+)?)\s*(?:ج\.?\s?م|جنيه|جنية|ج(?![\u0600-\u06FF])|egp|le\b|l\.e)/i);
  if (near) return near[1].replace(",", ".");
  const line = t.split(/\n+/).map((l) => l.trim()).find((l) => /^\d+(?:[.,]\d+)?\s*(?:ج|جنيه)?\.?$/.test(l));
  return line ? line.match(/\d+(?:[.,]\d+)?/)![0].replace(",", ".") : "";
}
function guessMoq(text: string): string {
  const t = digits(text);
  const m = t.match(/(?:أقل|اقل|الحد الأدنى|الحد الادنى|اقل كمية|أقل كمية)[^\d]{0,15}(\d+)/) || t.match(/(?:الدست[ةه]|الكرتون[ةه])\s*(\d+)/);
  return m ? m[1] : "";
}
function guessName(text: string): string {
  const lines = text.split(/\n+/).map(clean).filter((l) => l && !/^\d+([.,]\d+)?\s*(ج|جنيه|egp)?$/i.test(digits(l)));
  return (lines[0] || "").slice(0, 90);
}

function toRows(msgs: TgMsg[]): Row[] {
  const groups: { text: string; photos: string[]; t: number; id: number }[] = [];
  for (const m of msgs) {
    if (m.type !== "message") continue;
    const photo = m.photo || (m.mime_type?.startsWith("image/") ? m.file : undefined);
    const text = plain(m.text).trim();
    const t = Number(m.date_unixtime) || (m.date ? Date.parse(m.date) / 1000 : 0);
    const last = groups[groups.length - 1];
    const close = last && Math.abs(t - last.t) <= 90;
    if (photo && photo !== "(File not included. Change data exporting settings to download.)") {
      if (close && (!text || !last.text)) { last.photos.push(photo); if (text) last.text = text; last.t = t; }
      else groups.push({ text, photos: [photo], t, id: m.id });
    } else if (text && close && !last.text) { last.text = text; }
  }
  return groups.filter((g) => g.photos.length).map((g) => ({
    key: String(g.id), text: g.text, photos: g.photos.slice(0, 8),
    name: guessName(g.text), price: guessPrice(g.text), moq: guessMoq(g.text), on: true,
  }));
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
  const [done, setDone] = useState(0);

  const findFile = (path: string) => {
    const name = path.split("/").pop() || path;
    return files.get(path) || Array.from(files.entries()).find(([k]) => k.endsWith("/" + path) || k.endsWith("/" + name))?.[1];
  };
  const preview = useMemo(() => {
    const m = new Map<string, string>();
    rows.slice(0, 400).forEach((r) => { const f = findFile(r.photos[0]); if (f) m.set(r.key, URL.createObjectURL(f)); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, files]);

  const pick = async (list: FileList | null) => {
    setErr(""); setRows([]); setDone(0);
    if (!list?.length) return;
    const map = new Map<string, File>();
    let json: File | undefined;
    for (const f of Array.from(list)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      map.set(rel, f);
      if (/(^|\/)result\.json$/i.test(rel)) json = f;
    }
    if (!json) return setErr("مش لاقي ملف result.json. اختار المجلد اللي Telegram صدّره (فيه result.json ومجلد photos).");
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
    const c = cats.data?.find((x) => x.id === cat);
    if (!c) return setErr("اختار القسم الأول.");
    const m = owner === HOUSE.id ? { id: HOUSE.id, name: HOUSE.name, governorate: "القاهرة" } : merchants.data?.find((x) => x.id === owner);
    if (!m) return setErr("اختار التاجر.");
    setErr(""); setRunning(true);
    for (const r of chosen) {
      const price = Number(digits(r.price));
      const q = Math.max(1, Number(digits(r.moq || moq)) || 1);
      if (!(price > 0) || r.name.trim().length < 2) { upd(r.key, { state: "err", note: "ناقص اسم أو سعر" }); continue; }
      upd(r.key, { state: "busy", note: "" });
      try {
        const images: string[] = [];
        for (const p of r.photos) { const f = findFile(p); if (f) images.push(await uploadImage(f, user.uid, "products")); }
        if (!images.length) throw new Error("no images");
        const name = r.name.trim();
        await addDoc(collection(dbI(), "products"), {
          name, description: r.text.trim(), categoryId: c.id, categoryName: c.name, unit, moq: q,
          tiers: [{ min: q, price }], governorate: m.governorate || "القاهرة", images, colors: [], specs: [],
          cod: true, madeInEgypt: false, logoPrint: false, status: "active",
          keywords: Array.from(new Set(`${name} ${c.name}`.toLowerCase().split(/\s+/).filter((w) => w.length > 1))),
          merchantId: m.id, merchantName: m.name, ownerUid: user.uid, source: "telegram", sourceId: r.key, createdAt: serverTimestamp(),
        });
        upd(r.key, { state: "ok" }); setDone((d) => d + 1);
      } catch { upd(r.key, { state: "err", note: images0(r) ? "فشل الحفظ" : "الصورة مش موجودة في المجلد" }); }
    }
    setRunning(false);
  };
  const images0 = (r: Row) => r.photos.some((p) => findFile(p));

  return (
    <>
      <div className="card col">
        <h3>استيراد منتجات من تليجرام</h3>
        <ol className="mu" style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.9 }}>
          <li>افتح القناة في <b>Telegram Desktop</b> على الكمبيوتر، ومن (⋮) اختار <b>Export chat history</b>.</li>
          <li>علّم على <b>Photos</b> بس، واختار Format: <b>Machine-readable JSON</b>، واضغط Export.</li>
          <li>اختار هنا المجلد اللي اتصدّر (اسمه غالباً ChatExport_…).</li>
        </ol>
        <label className="drop"><i className="ph ph-folder-open" /><b style={{ color: "var(--pd)" }}>اختار مجلد التصدير</b><small>لازم يكون فيه result.json ومجلد photos</small>
          {/* @ts-expect-error non-standard directory picker attributes */}
          <input type="file" hidden multiple webkitdirectory="" directory="" onChange={(e) => pick(e.target.files)} />
        </label>
        <small>بتأكد إن المنتجات والصور ليك أو إن صاحبها موافق إنها تتنشر على العتبة.</small>
      </div>

      {rows.length > 0 && (
        <div className="card col">
          <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 4 }}>
            <div className="fld"><label>القسم (لكل المنتجات)</label><select className="in" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">اختار…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="fld"><label>تنزل باسم</label><select className="in" value={owner} onChange={(e) => setOwner(e.target.value)}><option value={HOUSE.id}>العتبة (الإدارة)</option>{merchants.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div className="fld"><label>الوحدة</label><select className="in" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
            <div className="fld"><label>أقل كمية (لو مش مكتوبة)</label><input className="in" inputMode="numeric" value={moq} onChange={(e) => setMoq(e.target.value.replace(/\D/g, ""))} /></div>
          </div>
          <div className="row wrap">
            <b className="sp">{rows.length} منتج اتلقى · {chosen.length} متعلّم · {done} اتضاف</b>
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
        {rows.slice(0, 400).map((r) => (
          <div key={r.key} className="card row wrap" style={{ alignItems: "flex-start", opacity: r.on ? 1 : 0.55, borderColor: r.state === "ok" ? "var(--ok)" : r.state === "err" ? "var(--err)" : undefined }}>
            <input type="checkbox" checked={r.on} disabled={r.state === "ok"} onChange={(e) => upd(r.key, { on: e.target.checked })} style={{ width: 20, height: 20, accentColor: "var(--pa)", marginTop: 18 }} aria-label="اختيار" />
            <div style={{ position: "relative", flex: "none" }}>
              {preview.get(r.key) ? <img src={preview.get(r.key)} alt="" className="ph-thumb" style={{ width: 76, height: 76 }} /> : <span className="ph-thumb" style={{ width: 76, height: 76, display: "grid", placeItems: "center" }}><i className="ph ph-image-broken" /></span>}
              {r.photos.length > 1 && <span className="bd" style={{ position: "absolute", bottom: 4, insetInlineStart: 4 }}>{r.photos.length}</span>}
            </div>
            <div className="sp col g8" style={{ minWidth: 220 }}>
              <input className="in" value={r.name} placeholder="اسم المنتج" onChange={(e) => upd(r.key, { name: e.target.value })} disabled={r.state === "ok"} />
              <div className="row">
                <input className="in" inputMode="decimal" value={r.price} placeholder="السعر ج.م" onChange={(e) => upd(r.key, { price: e.target.value })} disabled={r.state === "ok"} />
                <input className="in" inputMode="numeric" value={r.moq} placeholder={`أقل كمية (${moq})`} onChange={(e) => upd(r.key, { moq: e.target.value })} disabled={r.state === "ok"} />
              </div>
              {r.text && <small style={{ whiteSpace: "pre-wrap", maxHeight: 64, overflow: "hidden" }}>{r.text}</small>}
            </div>
            {r.state === "ok" ? <span className="bd v">موجود على الموقع</span> : r.state === "busy" ? <span className="bd w">جاري…</span> : r.state === "err" ? <span className="bd e">{r.note}</span> : null}
          </div>
        ))}
        {rows.length > 400 && <div className="alert">بيظهر أول 400 بوست بس. استورد دول، وبعدين اختار المجلد تاني وشيل علامة اللي اتضافوا.</div>}
      </div>
    </>
  );
}
