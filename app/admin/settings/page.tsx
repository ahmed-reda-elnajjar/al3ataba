"use client";
import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import type { Settings } from "@/lib/types";

export default function AdminSettings() {
  const { settings } = useApp();
  const [s, setS] = useState<Settings>(settings);
  const [msg, setMsg] = useState("");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setMsg("");
    try { await setDoc(doc(dbI(), "settings", "site"), { ...s, shippingPerMerchant: Number(s.shippingPerMerchant) || 0 }); setMsg("تم الحفظ. التغييرات هتظهر للزوار بعد تحديث الصفحة."); }
    catch { setMsg("تعذّر الحفظ."); }
  };
  return (
    <div className="card col" style={{ gap: 16 }}>
      <h3>إعدادات الموقع</h3>
      <div className="fld"><label>شريط إعلان أعلى الموقع (اتركه فاضي لإخفائه)</label><input className="in" value={s.announcement} onChange={(e) => set("announcement", e.target.value)} /></div>
      <div className="fld"><label>مصاريف الشحن لكل تاجر (ج.م)</label><input className="in" inputMode="numeric" value={s.shippingPerMerchant} onChange={(e) => set("shippingPerMerchant", Number(e.target.value.replace(/\D/g, "")))} /></div>
      <div className="fld"><label>رقم واتساب الدعم (مثال: 01012345678)</label><input className="in" style={{ direction: "ltr" }} value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></div>
      <div className="fld"><label>رقم هاتف الدعم</label><input className="in" style={{ direction: "ltr" }} value={s.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} /></div>
      <div className="fld"><label>تعليمات الدفع بالتحويل (بتظهر للمشتري عند الطلب)</label><textarea className="in" value={s.paymentInstructions} onChange={(e) => set("paymentInstructions", e.target.value)} /></div>
      <div className="row"><button className="btn" onClick={save}>حفظ</button>{msg && <span className="ok">{msg}</span>}</div>
    </div>
  );
}
