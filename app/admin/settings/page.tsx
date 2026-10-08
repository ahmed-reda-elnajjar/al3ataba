"use client";
import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import type { Settings } from "@/lib/types";
import { uploadImage } from "@/lib/img";

export default function AdminSettings() {
  const { settings, user } = useApp();
  const [up, setUp] = useState(false);
  const pick = async (file?: File) => { if (!file || !user) return; setUp(true); try { set("heroImage", await uploadImage(file, user.uid, "products")); } catch { setMsg("تعذّر رفع الصورة."); } setUp(false); };
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
      <b>بانر الصفحة الرئيسية</b>
      <div className="fld"><label>العنوان</label><input className="in" value={s.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} /></div>
      <div className="fld"><label>الجملة الصغيرة</label><input className="in" value={s.heroSub} onChange={(e) => set("heroSub", e.target.value)} /></div>
      <div className="fld"><label>صورة البانر (عريضة، يفضّل 1600×700)</label>
        {s.heroImage ? <div className="row"><img src={s.heroImage} alt="" style={{ width: 180, borderRadius: 12 }} /><button className="btn r sm2" onClick={() => set("heroImage", "")}>شيل الصورة</button></div>
          : <label className="drop"><i className="ph ph-image" /><span>{up ? "جاري الرفع…" : "اضغط لرفع صورة البانر"}</span><input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} /></label>}
      </div>
      <div className="fld"><label>المدينة اللي بتظهر في الهيدر على الموبايل</label><input className="in" value={s.city} onChange={(e) => set("city", e.target.value)} /></div>
      <hr style={{ border: 0, borderTop: "1px solid var(--bd)", width: "100%" }} />
      <div className="fld"><label>شريط إعلان أعلى الموقع (اتركه فاضي لإخفائه)</label><input className="in" value={s.announcement} onChange={(e) => set("announcement", e.target.value)} /></div>
      <div className="fld"><label>مصاريف الشحن لكل تاجر (ج.م)</label><input className="in" inputMode="numeric" value={s.shippingPerMerchant} onChange={(e) => set("shippingPerMerchant", Number(e.target.value.replace(/\D/g, "")))} /></div>
      <div className="fld"><label>رقم واتساب الدعم (مثال: 01012345678)</label><input className="in" style={{ direction: "ltr" }} value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></div>
      <div className="fld"><label>رقم هاتف الدعم</label><input className="in" style={{ direction: "ltr" }} value={s.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} /></div>
      <div className="fld"><label>تعليمات الدفع بالتحويل (بتظهر للمشتري عند الطلب)</label><textarea className="in" value={s.paymentInstructions} onChange={(e) => set("paymentInstructions", e.target.value)} /></div>
      <div className="row"><button className="btn" onClick={save}>حفظ</button>{msg && <span className="ok">{msg}</span>}</div>
    </div>
  );
}
