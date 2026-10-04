"use client";
import { useState } from "react";
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { dateStr, fmt, ms } from "@/lib/format";
import { Empty } from "@/components/Ui";
import type { Offer, Rfq } from "@/lib/types";

function OfferForm({ r, done }: { r: Rfq; done: () => void }) {
  const { user, merchant } = useApp();
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const p = Number(price), d = Number(days);
    if (!(p > 0) || !(d > 0)) return setErr("اكتب سعر الوحدة ومدة التوريد.");
    setBusy(true); setErr("");
    try {
      await addDoc(collection(dbI(), "offers"), {
        rfqId: r.id, rfqOwnerId: r.userId, rfqProduct: r.product, quantity: r.quantity,
        merchantId: user?.uid, merchantName: merchant?.name ?? "", price: p, total: p * r.quantity, days: d, note: note.trim(),
        status: "pending", createdAt: serverTimestamp(),
      });
      done();
    } catch { setErr("تعذّر إرسال العرض."); setBusy(false); }
  };
  return (
    <div className="col" style={{ background: "var(--mint)", padding: 12, borderRadius: 10 }}>
      <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 2 }}>
        <div className="fld"><label>سعر الوحدة (ج.م)</label><input className="in" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} /></div>
        <div className="fld"><label>مدة التوريد (أيام)</label><input className="in" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></div>
      </div>
      {Number(price) > 0 && <small>الإجمالي: {fmt(Number(price) * r.quantity)} ج.م</small>}
      <div className="fld"><label>ملاحظات</label><textarea className="in" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {err && <div className="err">{err}</div>}
      <button className="btn" disabled={busy} onClick={send}>{busy ? "جاري الإرسال…" : "إرسال العرض"}</button>
    </div>
  );
}

export default function MerchantRfqs() {
  const { user } = useApp();
  const { data, loading, reload } = useAsync(async () => {
    const [r, o] = await Promise.all([
      getDocs(query(collection(dbI(), "rfqs"), where("status", "==", "open"), limit(200))),
      getDocs(query(collection(dbI(), "offers"), where("merchantId", "==", user?.uid ?? ""))),
    ]);
    return {
      rfqs: r.docs.map((d) => withId<Rfq>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
      offered: new Map(o.docs.map((d) => withId<Offer>(d)).map((x) => [x.rfqId, x])),
    };
  }, [user?.uid]);
  const [open, setOpen] = useState("");
  return (
    <>
      <b style={{ fontSize: 18 }}>طلبات عروض الأسعار المفتوحة</b>
      {loading || !data ? <div className="skel" /> : !data.rfqs.length ? <Empty icon="ph-clipboard-text" title="مفيش طلبات مفتوحة دلوقتي" /> : (
        <div className="col">
          {data.rfqs.map((r) => {
            const mine = data.offered.get(r.id);
            return (
              <div key={r.id} className="card col">
                <div className="row wrap"><b className="sp">{r.product}</b><small>{dateStr(r.createdAt)}</small></div>
                <small>{r.quantity} {r.unit} · {r.governorate} · ميزانية: {r.budget || "—"} · مطلوب قبل: {r.neededBy || "—"}</small>
                {r.specs && <small>{r.specs}</small>}
                {r.image && <img src={r.image} alt="" style={{ maxWidth: 160, borderRadius: 8 }} />}
                {mine ? <div className="alert">عرضك اتبعت: {fmt(mine.price)} ج.م للوحدة · {mine.status === "accepted" ? "العميل قبل عرضك 🎉" : "في انتظار رد العميل"}</div>
                  : open === r.id ? <OfferForm r={r} done={() => { setOpen(""); reload(); }} />
                  : <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(r.id)}>قدّم عرض</button>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
