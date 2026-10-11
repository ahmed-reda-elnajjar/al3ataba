"use client";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";

type Run = { at?: string; checked?: number; hidden?: number; restored?: number; gone?: number; seconds?: number; note?: string; error?: string; by?: string };
const n = (v: unknown) => Number(v) || 0;

/** Admin card: last automatic stock check against the partner stores + "run now". */
export function StockSync() {
  const { user } = useApp();
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => getDoc(doc(dbI(), "sync", "stock")).then((s) => setRun((s.data() as Run) || null)).catch(() => {});
  useEffect(() => { load(); }, []);
  const now = async () => {
    if (!user) return;
    setBusy(true); setMsg("جاري الفحص… ممكن ياخد لحد دقيقة");
    try {
      const r = await fetch("/api/stock-sync", { headers: { "x-firebase-token": await user.getIdToken() } });
      const j = await r.json();
      setMsg(j.error ? `مشكلة: ${j.error}` : `خلص ✓ اتفحص ${n(j.checked)} منتج · اتخفى ${n(j.hidden)} · رجع ${n(j.restored)}`);
      load();
    } catch (e) { setMsg("مشكلة: " + String((e as Error)?.message || e)); }
    setBusy(false);
  };
  const when = run?.at ? new Date(run.at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <div className="card col" style={{ gap: 8 }}>
      <div className="row wrap"><b className="sp"><i className="ph ph-arrows-clockwise" style={{ color: "var(--gold)" }} /> الفحص التلقائي للمخزون (كل يوم)</b><button className="btn o sm2" disabled={busy} onClick={now}>{busy ? "جاري…" : "شغّل الفحص دلوقتي"}</button></div>
      <small>كل يوم الصبح الموقع بيشيك على لينكات الموردين المحفوظة: اللي خلص عندهم بيستخبى من عندك، واللي رجع بيتنشر تاني لوحده.</small>
      {run ? (run.error
        ? <div className="alert e">آخر محاولة ({when}): {run.error}</div>
        : <div className="alert">آخر فحص: <b>{when}</b>{run.by === "admin" ? " (يدوي)" : ""} · اتفحص <b>{n(run.checked)}</b> منتج · اتخفى <b>{n(run.hidden)}</b> · رجع للنشر <b>{n(run.restored)}</b>{n(run.gone) ? ` · ${n(run.gone)} مش موجودين عندهم خالص` : ""}{run.note ? <><br /><small>{run.note}</small></> : null}</div>)
        : <small className="mu">لسه مفيش فحص اتعمل.</small>}
      {msg && <span className="ok">{msg}</span>}
    </div>
  );
}
