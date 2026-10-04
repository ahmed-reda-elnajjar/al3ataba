"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { fmt, dateStr, ms } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { withId } from "@/lib/store";
import type { Offer, Order, Rfq } from "@/lib/types";
import { RequireLogin } from "@/components/Guard";
import { OrdersList } from "@/components/OrdersList";
import { Empty, Loading, Status } from "@/components/Ui";

function Body() {
  const { user, add, signOut, isAdmin, merchant } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState(useSearchParams().get("tab") || "orders");
  const uid = user?.uid || "";
  const { data, loading, reload } = useAsync(async () => {
    const [o, r, f] = await Promise.all([
      getDocs(query(collection(dbI(), "orders"), where("userId", "==", uid))),
      getDocs(query(collection(dbI(), "rfqs"), where("userId", "==", uid))),
      getDocs(query(collection(dbI(), "offers"), where("rfqOwnerId", "==", uid))),
    ]);
    return {
      orders: o.docs.map((d) => withId<Order>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
      rfqs: r.docs.map((d) => withId<Rfq>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
      offers: f.docs.map((d) => withId<Offer>(d)),
    };
  }, [uid]);

  const cancel = async (o: Order, s: string) => { await updateDoc(doc(dbI(), "orders", o.id), { status: s, updatedAt: serverTimestamp() }); reload(); };
  const accept = async (o: Offer, r: Rfq) => {
    await updateDoc(doc(dbI(), "offers", o.id), { status: "accepted", updatedAt: serverTimestamp() });
    await updateDoc(doc(dbI(), "rfqs", r.id), { status: "closed", updatedAt: serverTimestamp() });
    add({ id: `offer:${o.id}`, productId: `offer:${o.id}`, name: r.product, merchantId: o.merchantId, merchant: o.merchantName, qty: o.quantity, price: o.price, unit: r.unit, moq: 1, fixed: true });
    router.push("/cart");
  };

  return (
    <div className="wc">
      <h1 style={{ marginBottom: 14 }}>حسابي</h1>
      <div className="scr" style={{ marginBottom: 16 }}>
        {[["orders", "طلباتي"], ["rfq", "طلبات عروض الأسعار"], ["profile", "بياناتي"]].map(([k, t]) => <span key={k} className={`chip${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{t}</span>)}
      </div>
      {loading ? <Loading rows={2} /> : tab === "orders" ? <OrdersList orders={data?.orders ?? []} role="buyer" onStatus={cancel} /> : tab === "rfq" ? (
        (data?.rfqs.length ?? 0) === 0 ? <Empty icon="ph-clipboard-text" title="مفيش طلبات عروض أسعار"><Link href="/rfq" className="btn">اطلب عرض سعر</Link></Empty> : (
          <div className="col">
            {data!.rfqs.map((r) => {
              const offers = data!.offers.filter((o) => o.rfqId === r.id);
              return (
                <div key={r.id} className="card col">
                  <div className="row wrap"><b className="sp">{r.product} — {r.quantity} {r.unit}</b><small>{dateStr(r.createdAt)}</small><Status s={r.status} /></div>
                  {offers.length === 0 ? <small>لسه مفيش عروض. هتوصلك أول ما التجار يردوا.</small> : offers.map((o) => (
                    <div key={o.id} className="card row wrap" style={{ background: "var(--mint)", border: 0 }}>
                      <div className="sp"><b>{o.merchantName}</b><br /><small>{fmt(o.price)} ج.م / {r.unit} · الإجمالي {fmt(o.total)} ج.م · تجهيز {o.days} يوم{o.note ? ` · ${o.note}` : ""}</small></div>
                      {o.status === "accepted" ? <Status s="accepted" /> : r.status === "open" && <button className="btn sm2" onClick={() => accept(o, r)}>اقبل العرض</button>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="card col" style={{ maxWidth: 520 }}>
          <div><small>الحساب</small><div style={{ direction: "ltr", textAlign: "right" }}><b>{user?.email || user?.phoneNumber}</b></div></div>
          {isAdmin && <Link href="/admin" className="btn o">لوحة الإدارة</Link>}
          {merchant ? <Link href="/merchant" className="btn o">لوحة التاجر</Link> : <Link href="/sell" className="btn o">سجّل كتاجر</Link>}
          <button className="btn r" onClick={async () => { await signOut(); router.push("/"); }}>تسجيل خروج</button>
        </div>
      )}
    </div>
  );
}

export default function Account() { return <RequireLogin><Suspense><Body /></Suspense></RequireLogin>; }
