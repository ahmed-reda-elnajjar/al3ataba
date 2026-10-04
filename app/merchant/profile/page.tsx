"use client";
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { GOVERNORATES } from "@/lib/config";

export default function MerchantProfile() {
  const { merchant, user } = useApp();
  const [name, setName] = useState(merchant?.name ?? "");
  const [phone, setPhone] = useState(merchant?.phone ?? "");
  const [gov, setGov] = useState(merchant?.governorate ?? "القاهرة");
  const [city, setCity] = useState(merchant?.city ?? "");
  const [about, setAbout] = useState(merchant?.about ?? "");
  const [msg, setMsg] = useState("");
  const save = async () => {
    if (!user) return;
    try { await updateDoc(doc(dbI(), "merchants", user.uid), { name: name.trim(), phone: phone.trim(), governorate: gov, city: city.trim(), about: about.trim() }); setMsg("تم الحفظ."); }
    catch { setMsg("تعذّر الحفظ."); }
  };
  return (
    <div className="card col" style={{ gap: 16 }}>
      <h3>بيانات المتجر</h3>
      <div className="fld"><label>اسم المتجر</label><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 3 }}>
        <div className="fld"><label>رقم الموبايل</label><input className="in" style={{ direction: "ltr" }} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="fld"><label>المحافظة</label><select className="in" value={gov} onChange={(e) => setGov(e.target.value)}>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
        <div className="fld"><label>المدينة / المنطقة</label><input className="in" value={city} onChange={(e) => setCity(e.target.value)} /></div>
      </div>
      <div className="fld"><label>نبذة عن المتجر</label><textarea className="in" value={about} onChange={(e) => setAbout(e.target.value)} /></div>
      <div className="row"><button className="btn" onClick={save}>حفظ</button>{msg && <span className="ok">{msg}</span>}</div>
    </div>
  );
}
