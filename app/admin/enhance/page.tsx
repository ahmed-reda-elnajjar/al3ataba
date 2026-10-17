"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { withId } from "@/lib/store";
import { sized } from "@/lib/media";
import { enhanceMany, undoEnhance, type Opts, type Step } from "@/lib/enhance";
import type { Product } from "@/lib/types";

/* Bulk polish: studio photos + professional descriptions for existing products. */
export default function EnhancePage() {
  const { user } = useApp();
  const { data, loading, reload } = useAsync(async () => (await getDocs(collection(dbI(), "products"))).docs.map((d) => withId<Product>(d)), []);
  const all = useMemo(() => data ?? [], [data]);
  const [scope, setScope] = useState<"pending" | "todo" | "all">("todo");
  const [o, setO] = useState<Opts>({ images: "cover", text: true, names: true });
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Step[]>([]);
  const [msg, setMsg] = useState("");
  const stopRef = useRef(false);

  const stats = { total: all.length, studio: all.filter((p) => p.studio).length, ai: all.filter((p) => p.aiCopy).length, noDesc: all.filter((p) => (p.description || "").trim().length < 15).length };
  const target = all.filter((p) => scope === "all" ? true : scope === "pending" ? p.status === "pending" : (!p.studio && o.images !== "none") || (!p.aiCopy && o.text));

  const start = async () => {
    if (!user || !target.length) return;
    if (!confirm(`هيتم تحسين ${target.length} منتج. ممكن ياخد وقت (الصورة حوالي 20–40 ثانية). تكمّل؟`)) return;
    stopRef.current = false; setRunning(true); setLog([]); setMsg("");
    await enhanceMany(user, target, o, (s) => setLog((l) => [s, ...l].slice(0, 400)), () => stopRef.current);
    setRunning(false); setMsg(stopRef.current ? "اتوقف." : "خلص ✓ — المنتجات المتعدلة اتشال منها علامة \"تم المراجعة\" علشان تراجعها."); reload();
  };
  const undo = async (id: string, what: "images" | "text") => {
    const p = all.find((x) => x.id === id); if (!p) return;
    await undoEnhance(p, what); setLog((l) => l.map((s) => (s.id === id ? { ...s, note: `${s.note} — اترجع الأصل` } : s))); reload();
  };
  const ok = log.filter((s) => s.ok).length, bad = log.filter((s) => !s.ok).length;

  return (
    <>
      <div className="card col" style={{ gap: 10 }}>
        <h3><i className="ph ph-magic-wand" style={{ color: "var(--gold)" }} /> تحسين الصور والأوصاف</h3>
        <small>الصور: بتتشال الخلفية وتتحط خلفية بيضا موحدة، والصورة بتبقى مربعة وأوضح وبجودة أعلى. الأوصاف: بتتعاد صياغتها بشكل احترافي في نقاط واضحة من غير ما نخترع مواصفات. الأصل بيفضل محفوظ وتقدر ترجعله في أي وقت.</small>
        <div className="row wrap g8">
          <span className="bd">{stats.total} منتج</span>
          <span className="bd v">{stats.studio} صورهم اتحسنت</span>
          <span className="bd v">{stats.ai} وصفهم اتعاد</span>
          <span className="bd w">{stats.noDesc} من غير وصف تقريباً</span>
        </div>
      </div>

      <div className="card col" style={{ gap: 12 }}>
        <b>هتحسّن إيه؟</b>
        <div className="row wrap g8">
          {([["todo", "اللي لسه ماتحسنش"], ["pending", "المستني المراجعة (المستورد جديد)"], ["all", "كل المنتجات"]] as const).map(([k, t]) => <button key={k} className={`chip${scope === k ? " on" : ""}`} onClick={() => setScope(k)}>{t}</button>)}
        </div>
        <div className="row wrap g8">
          <b style={{ minWidth: 60 }}>الصور:</b>
          {([["cover", "الصورة الرئيسية بس"], ["all", "كل الصور"], ["none", "من غير صور"]] as const).map(([k, t]) => <button key={k} className={`chip${o.images === k ? " on" : ""}`} onClick={() => setO({ ...o, images: k })}>{t}</button>)}
        </div>
        <div className="row wrap g8">
          <label className="chk"><input type="checkbox" checked={o.text} onChange={(e) => setO({ ...o, text: e.target.checked })} />إعادة صياغة الوصف</label>
          <label className="chk"><input type="checkbox" checked={o.names} disabled={!o.text} onChange={(e) => setO({ ...o, names: e.target.checked })} />وتحسين الاسم كمان</label>
        </div>
        <small className="mu">الصورة الرئيسية بس أسرع وبتوفّر من رصيد Cloudinary. ابدأ بكام منتج وشوف النتيجة قبل ما تعمل الكل.</small>
        <div className="row wrap">
          <b className="sp">{loading ? "جاري التحميل…" : `${target.length} منتج هيتحسن`}</b>
          {running ? <button className="btn r" onClick={() => { stopRef.current = true; }}>إيقاف</button>
            : <button className="btn" disabled={!target.length || loading} onClick={start}><i className="ph ph-magic-wand" />ابدأ التحسين</button>}
        </div>
        {(running || log.length > 0) && <div className="alert">{running ? "شغال… سيب الصفحة مفتوحة. " : ""}نجح {ok} · فشل {bad}</div>}
        {msg && <span className="ok">{msg}</span>}
      </div>

      {log.length > 0 && (
        <div className="col">
          {log.map((s, i) => (
            <div key={i} className="card row wrap" style={{ borderColor: s.ok ? undefined : "var(--err)" }}>
              {s.before && <img src={sized(s.before, 120)} alt="قبل" className="ph-thumb" style={{ width: 64, height: 64 }} />}
              {s.after && <><i className="ph ph-arrow-left" /><img src={sized(s.after, 120)} alt="بعد" className="ph-thumb" style={{ width: 64, height: 64 }} /></>}
              <div className="sp" style={{ minWidth: 180 }}><b>{s.name}</b><br /><small style={{ color: s.ok ? undefined : "var(--err)" }}>{s.note}</small></div>
              <Link className="btn o sm2" href={`/product/${s.id}`} target="_blank">عرض</Link>
              <Link className="btn o sm2" href={`/admin/products/${s.id}`} target="_blank">تعديل</Link>
              {s.ok && s.after && <button className="btn o sm2" onClick={() => undo(s.id, "images")}>رجّع الصور</button>}
              {s.ok && s.note.includes("الوصف") && <button className="btn o sm2" onClick={() => undo(s.id, "text")}>رجّع الوصف</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
