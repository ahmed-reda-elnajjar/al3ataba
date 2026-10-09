"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { st } from "@/lib/style";
import { GOVERNORATES, PAY_METHODS, SHIP_METHODS, isTransfer } from "@/lib/config";
import { fmt, orderNo } from "@/lib/format";
import { useApp } from "@/lib/providers";
import { RequireLogin } from "@/components/Guard";
import { Empty } from "@/components/Ui";

function Form() {
  const { items, user, clear, settings } = useApp();
  const router = useRouter();
  const [ship, setShip] = useState("ship");
  const [pay, setPay] = useState("cod");
  const [f, setF] = useState({ name: user?.displayName || "", phone: user?.phoneNumber || "", governorate: "", city: "", street: "", landmark: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (!items.length) return <div className="wc"><Empty icon="ph-shopping-cart" title="السلة فاضية"><Link href="/search" className="btn">تصفّح المنتجات</Link></Empty></div>;

  const groups = Object.values(items.reduce<Record<string, typeof items>>((m, i) => { (m[i.merchantId] ||= []).push(i); return m; }, {}));
  const perShip = ship === "pickup" ? 0 : settings.shippingPerMerchant;
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const total = subtotal + perShip * groups.length;
  const codOk = items.every((i) => i.cod !== false);
  const phoneOk = f.phone.replace(/\D/g, "").length >= 10;
  const valid = f.name.trim() && phoneOk && f.governorate && f.city.trim() && f.street.trim();

  const confirm = async () => {
    if (!user) return;
    setBusy(true); setError("");
    const db = dbI();
    const base = orderNo();
    const batch = writeBatch(db);
    const nos: string[] = [];
    groups.forEach((list, idx) => {
      const no = groups.length > 1 ? `${base}-${idx + 1}` : base;
      nos.push(no);
      const sub = list.reduce((s, i) => s + i.qty * i.price, 0);
      batch.set(doc(collection(db, "orders")), {
        orderNo: no, userId: user.uid, buyerName: f.name.trim(), phone: f.phone.trim(),
        merchantId: list[0].merchantId, merchantName: list[0].merchant,
        items: list.map((i) => ({ id: i.id, productId: i.productId, name: i.name, merchantId: i.merchantId, merchant: i.merchant, qty: i.qty, price: i.price, unit: i.unit, moq: i.moq, image: i.image || "" })),
        address: { governorate: f.governorate, city: f.city.trim(), street: f.street.trim(), landmark: f.landmark.trim() },
        shipping: { method: ship, cost: perShip }, payment: pay, note: f.note.trim(),
        subtotal: sub, total: sub + perShip, status: "new", createdAt: serverTimestamp(),
      });
    });
    try {
      await batch.commit();
      clear();
      router.push(`/done?no=${encodeURIComponent(nos.join(","))}&pay=${pay}`);
    } catch {
      setError("مقدرناش نحفظ الطلب دلوقتي. اتأكد من اتصالك وجرّب تاني.");
      setBusy(false);
    }
  };

  return (
    <div className="wc" style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: 14 }}>الدفع وإتمام الطلب</h1>
      <div className="st" style={{ maxWidth: 520, margin: "0 auto 18px" }}>
        <div className={valid ? "dn" : "on"}><b>{valid ? <i className="ph ph-check" style={{ fontSize: 16 }} /> : 1}</b>العنوان</div>
        <div className={valid ? "on" : ""}><b>2</b>الدفع</div>
        <div><b>3</b>التأكيد</div>
      </div>
      <div className="row wrap" style={{ alignItems: "flex-start", gap: 24 }}>
        <div className="sp col" style={{ minWidth: 300 }}>
          <div className="card col"><h3>بيانات التوصيل</h3>
            <div className="grid" style={st("--m:1;--d:2")}>
              <div className="fld"><label>الاسم</label><input className="in" value={f.name} onChange={set("name")} /></div>
              <div className="fld"><label>رقم الموبايل</label><input className="in" inputMode="tel" style={{ direction: "ltr", textAlign: "right" }} value={f.phone} onChange={set("phone")} placeholder="01012345678" /></div>
              <div className="fld"><label>المحافظة</label><select className="in" value={f.governorate} onChange={set("governorate")}><option value="">اختار</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
              <div className="fld"><label>المدينة / المنطقة</label><input className="in" value={f.city} onChange={set("city")} /></div>
            </div>
            <div className="fld"><label>الشارع والعنوان بالتفصيل</label><input className="in" value={f.street} onChange={set("street")} /></div>
            <div className="fld"><label>علامة مميزة (اختياري)</label><input className="in" value={f.landmark} onChange={set("landmark")} /></div>
            <div className="fld"><label>ملاحظات للتاجر (اختياري)</label><textarea className="in" value={f.note} onChange={set("note")} /></div>
          </div>
          <div className="card col"><h3>طريقة الاستلام</h3>
            {SHIP_METHODS.map((m) => <div key={m.id} className={`opt${ship === m.id ? " on" : ""}`} onClick={() => setShip(m.id)}><i className={`ph ${m.icon}`} /><span className="sp">{m.label}</span><b>{m.id === "pickup" ? "مجاناً" : `${fmt(settings.shippingPerMerchant)} ج.م / تاجر`}</b><span className="ck">{ship === m.id && <i className="ph ph-check" />}</span></div>)}
          </div>
          <div className="card col"><h3>طريقة الدفع</h3>
            {PAY_METHODS.filter((m) => !m.hidden).map((m) => {
              const off = m.id === "cod" && !codOk;
              return <div key={m.id} className={`opt${pay === m.id ? " on" : ""}${off ? " dis" : ""}`} onClick={() => !off && setPay(m.id)}><i className={`ph ${m.icon}`} /><span className="sp">{m.label}{off && " (غير متاح لبعض المنتجات)"}</span><span className="ck">{pay === m.id && <i className="ph ph-check" />}</span></div>;
            })}
            <div className="opt dis"><i className="ph ph-credit-card" /><span className="sp">بطاقة بنكية <small>(قريباً)</small></span><span className="ck" /></div>
            {isTransfer(pay) && <div className="alert">{settings.paymentInstructions}</div>}
          </div>
        </div>
        <div className="card col" style={{ width: 320, maxWidth: "100%", flex: "none" }}>
          <h3>ملخص الطلب</h3>
          <div className="row"><span className="sp">{items.length} منتج من {groups.length} تاجر</span>{fmt(subtotal)} ج.م</div>
          <div className="row"><span className="sp">الشحن</span>{fmt(perShip * groups.length)} ج.م</div>
          <div className="row b"><span className="sp">الإجمالي</span><span style={{ fontSize: 22 }}>{fmt(total)} ج.م</span></div>
          {error && <p className="err">{error}</p>}
          <button className="btn blk" disabled={busy || !valid || (pay === "cod" && !codOk)} onClick={confirm}>{busy ? "جاري الحفظ…" : "إتمام الدفع وتأكيد الطلب"}</button>
          {!valid && <small>كمّل بيانات التوصيل (رقم موبايل صحيح) عشان تقدر تأكد.</small>}
        </div>
      </div>
    </div>
  );
}

export default function Checkout() {
  return <RequireLogin why="سجّل دخولك عشان نربط الطلب بحسابك وتقدر تتابعه."><Form /></RequireLogin>;
}
