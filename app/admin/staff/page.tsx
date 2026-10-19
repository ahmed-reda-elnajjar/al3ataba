"use client";
/* Main admins: add / remove team members who manage one section only (for now: البيع بالعمولة). */
import { useState } from "react";
import type { User } from "firebase/auth";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { Empty } from "@/components/Ui";

type Staff = { id: string; key: string; name: string; role: string; addedAt?: number };
async function api<T>(user: User, body?: unknown): Promise<T> {
  const r = await fetch("/api/admin/staff", { method: body ? "POST" : "GET", cache: "no-store", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `حصلت مشكلة (${r.status})`);
  return j as T;
}

export default function StaffPage() {
  const { user } = useApp();
  const { data, loading, error, reload } = useAsync(async () => (user ? api<{ staff: Staff[]; roles: Record<string, string> }>(user) : null), [user?.uid]);
  const [f, setF] = useState({ identifier: "", name: "", role: "resell" });
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!user) return; setErr(""); setOk(""); setBusy(true);
    try { await api(user, f); setOk(`اتضاف ${f.name} ✓ يقدر يدخل دلوقتي من صفحة "إدارة البيع بالعمولة" (al3ataba.vercel.app/staff/resell)`); setF({ identifier: "", name: "", role: "resell" }); reload(); }
    catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  const remove = async (s: Staff) => { if (!user || !confirm(`شيل صلاحية ${s.name}؟`)) return; try { await api(user, { action: "remove", key: s.key }); reload(); } catch (e) { alert(String((e as Error).message)); } };
  return (
    <div className="col" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 20 }}>الموظفين والصلاحيات</h2>
      <div className="card col" style={{ gap: 10 }}>
        <b>إضافة موظف</b>
        <small className="mu">الموظف بيشوف القسم اللي تختاره بس، ومالوش أي صلاحية تانية على الإدارة. بيسجّل دخول عادي بنفس الإيميل (لازم يكون متفعّل) أو رقم الموبايل اللي هتكتبه هنا.</small>
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="in" style={{ maxWidth: 260 }} placeholder="الإيميل أو رقم الموبايل" value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} />
          <input className="in" style={{ maxWidth: 200 }} placeholder="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className="in" style={{ maxWidth: 220 }} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(data?.roles || { resell: "مدير البيع بالعمولة" }).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          <button className="btn" disabled={busy} onClick={add}>{busy ? "…" : "إضافة"}</button>
        </div>
        {err && <div className="err">{err}</div>}
        {ok && <div className="ok">{ok}</div>}
        <small className="mu">مدير البيع بالعمولة يقدر: يشوف ويغيّر حالة طلبات البائعين، يفعّل ويوقف البائعين، ويعلّم طلبات السحب اتحوّلت. إعدادات النسب والشحن للإدارة الرئيسية بس.</small>
      </div>
      {error ? <Empty icon="ph-warning" title="مقدرتش أحمّل القائمة" sub={error} /> : loading ? <div className="skel" /> : !data?.staff.length ? <Empty icon="ph-users" title="مفيش موظفين لسه" /> : data.staff.map((s) => (
        <div key={s.key} className="card row wrap" style={{ gap: 10 }}>
          <div className="sp col" style={{ gap: 2 }}><b>{s.name}</b><small className="mu" style={{ direction: "ltr", textAlign: "right" }}>{s.key}</small></div>
          <span className="bd">{data.roles[s.role] || s.role}</span>
          <button className="btn r sm2" onClick={() => remove(s)}>شيل الصلاحية</button>
        </div>
      ))}
    </div>
  );
}
