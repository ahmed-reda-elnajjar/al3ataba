"use client";
import { useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { st } from "@/lib/style";
import { GOVERNORATES, MERCHANT_TYPES } from "@/lib/config";
import { useApp } from "@/lib/providers";
import { Status } from "@/components/Ui";

const PERKS = [
  ["ph-users-three", "مشترين جملة", "محلات ومطاعم وشركات بتدور على موردين"],
  ["ph-clipboard-text", "طلبات عروض أسعار", "بتوصلك طلبات جاهزة وترد بعرضك"],
  ["ph-gift", "مجاناً في فترة الإطلاق", "من غير اشتراك ولا عمولة وقت الإطلاق"],
];

export default function Sell() {
  const { ready, loggedIn, user, merchant } = useApp();
  const [f, setF] = useState({ name: "", type: MERCHANT_TYPES[0], governorate: "", city: "", phone: "", about: "", regNo: "", taxNo: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim() && f.governorate && f.phone.replace(/\D/g, "").length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !ok) return;
    setBusy(true); setError("");
    try {
      await setDoc(doc(dbI(), "merchants", user.uid), {
        name: f.name.trim(), type: f.type, governorate: f.governorate, city: f.city.trim(), phone: f.phone.trim(), about: f.about.trim(),
        regNo: f.regNo.trim(), taxNo: f.taxNo.trim(), email: user.email || "",
        status: "pending", verified: false, plan: "free", ownerUid: user.uid, createdAt: serverTimestamp(),
      });
    } catch { setError("مقدرناش نبعت الطلب. جرّب تاني."); }
    setBusy(false);
  };

  return (
    <>
      <div className="hero"><div className="col" style={{ maxWidth: 720, margin: "auto", textAlign: "center", alignItems: "center" }}>
        <h1 style={{ color: "var(--pm)" }}>بيع بالجملة لكل مصر</h1>
        <p className="mu" style={{ fontSize: 17 }}>افتح متجرك على العتبة، ضيف منتجاتك بأسعار الكميات، واستقبل طلبات من تجار وشركات.</p>
      </div></div>
      <div className="wc" style={{ maxWidth: 820 }}>
        <div className="grid" style={st("--m:1;--d:3")}>
          {PERKS.map(([ic, t, d]) => <div key={t} className="card col g4"><i className={`ph ${ic}`} style={{ fontSize: 34, color: "var(--pa)" }} /><b>{t}</b><small>{d}</small></div>)}
        </div>
        <div className="card col mt2" id="register">
          {!ready ? <div className="skel" /> : !loggedIn ? (
            <><h2>سجّل متجرك</h2><p className="mu">محتاج تسجّل دخولك الأول.</p><Link href="/login?next=/sell" className="btn">تسجيل الدخول</Link></>
          ) : merchant ? (
            <>
              <div className="row"><h2 className="sp">متجرك: {merchant.name}</h2><Status s={merchant.status} /></div>
              {merchant.status === "pending" && <div className="alert">استلمنا طلبك وهنراجع بياناتك ونتواصل معاك على الموبايل. بعد القبول تقدر تضيف منتجاتك.</div>}
              {merchant.status === "approved" && <Link href="/merchant" className="btn">ادخل على لوحة التاجر</Link>}
              {merchant.status === "rejected" && <div className="alert e">تم رفض الطلب. تواصل مع الدعم لو محتاج توضيح.</div>}
            </>
          ) : (
            <form className="col" onSubmit={submit}>
              <h2>بيانات المتجر</h2>
              <div className="grid" style={st("--m:1;--d:2")}>
                <div className="fld"><label>اسم المتجر / المصنع</label><input className="in" value={f.name} onChange={set("name")} /></div>
                <div className="fld"><label>النوع</label><select className="in" value={f.type} onChange={set("type")}>{MERCHANT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div className="fld"><label>المحافظة</label><select className="in" value={f.governorate} onChange={set("governorate")}><option value="">اختار</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
                <div className="fld"><label>المدينة / المنطقة</label><input className="in" value={f.city} onChange={set("city")} /></div>
                <div className="fld"><label>موبايل للتواصل</label><input className="in" inputMode="tel" style={{ direction: "ltr", textAlign: "right" }} value={f.phone} onChange={set("phone")} /></div>
                <div className="fld"><label>رقم السجل التجاري (للتوثيق)</label><input className="in" value={f.regNo} onChange={set("regNo")} /></div>
                <div className="fld"><label>رقم البطاقة الضريبية (للتوثيق)</label><input className="in" value={f.taxNo} onChange={set("taxNo")} /></div>
              </div>
              <div className="fld"><label>نبذة عن نشاطك</label><textarea className="in" value={f.about} onChange={set("about")} placeholder="إيه اللي بتصنعه أو بتوزعه، وطاقتك الإنتاجية" /></div>
              {error && <p className="err">{error}</p>}
              <button className="btn" disabled={busy || !ok}>{busy ? "جاري الإرسال…" : "ابعت طلب التسجيل"}</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
