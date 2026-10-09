"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { fmt, dateStr, ms } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useApp } from "@/lib/providers";
import { productsByIds, withId } from "@/lib/store";
import { useFavs } from "@/lib/favs";
import { st } from "@/lib/style";
import type { Offer, Order, Rfq } from "@/lib/types";
import { RequireLogin } from "@/components/Guard";
import { OrdersList } from "@/components/OrdersList";
import { Empty, Loading, ProductCard, Status } from "@/components/Ui";

function Body() {
  const { user, add, signOut, isAdmin, merchant } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState(useSearchParams().get("tab") || "");
  const favs = useFavs();
  const { data: favProducts } = useAsync(async () => (tab === "favs" && favs.ids.length ? productsByIds(favs.ids) : []), [tab, favs.ids.join(",")]);
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

  const name = user?.displayName || (user?.email ? user.email.split("@")[0] : "") || "حسابي";
  const M = ({ k, ic, t, n }: { k: string; ic: string; t: string; n?: number }) => (
    <button onClick={() => setTab(k)}><span className="mi"><i className={`ph ${ic}`} /></span><span className="sp">{t}</span>{n ? <span className="bd g">{n}</span> : null}<i className="ph ph-caret-left chev" /></button>
  );
  const titles: Record<string, string> = { orders: "طلباتي", rfq: "طلبات عروض الأسعار", favs: "المفضلة" };
  return (
    <div className="wc" style={{ maxWidth: 760 }}>
      {!tab ? (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--pd)", color: "var(--gold2)", display: "grid", placeItems: "center", font: "700 26px Alexandria", flex: "none" }}>{name.slice(0, 1).toUpperCase()}</span>
            <div className="sp"><h2>{name}</h2><small style={{ direction: "ltr", display: "block", textAlign: "right" }}>{user?.phoneNumber || user?.email}</small></div>
          </div>
          <div className="menu">
            <M k="orders" ic="ph-receipt" t="طلباتي" n={data?.orders.length} />
            <M k="rfq" ic="ph-clipboard-text" t="طلبات عروض الأسعار" n={data?.rfqs.length} />
            <M k="favs" ic="ph-heart" t="المفضلة" n={favs.ids.length} />
            {isAdmin && <Link href="/admin"><span className="mi"><i className="ph ph-gear" /></span><span className="sp">لوحة الإدارة</span><i className="ph ph-caret-left chev" /></Link>}
            {merchant ? <Link href="/merchant"><span className="mi"><i className="ph ph-storefront" /></span><span className="sp">لوحة التاجر</span><i className="ph ph-caret-left chev" /></Link>
              : <Link href="/sell"><span className="mi"><i className="ph ph-storefront" /></span><span className="sp">سجّل كتاجر وابدأ البيع</span><i className="ph ph-caret-left chev" /></Link>}
            <Link href="/help"><span className="mi"><i className="ph ph-question" /></span><span className="sp">المساعدة والدعم</span><i className="ph ph-caret-left chev" /></Link>
            <button onClick={async () => { await signOut(); router.push("/"); }} style={{ color: "var(--err)" }}><span className="mi" style={{ color: "var(--err)" }}><i className="ph ph-sign-out" /></span><span className="sp">تسجيل خروج</span></button>
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="ico" onClick={() => setTab("")} aria-label="رجوع"><i className="ph ph-arrow-right" /></button>
            <h1 style={{ fontSize: 22 }}>{titles[tab] ?? "حسابي"}</h1>
          </div>
          {loading ? <Loading rows={2} /> : tab === "orders" ? <OrdersList orders={data?.orders ?? []} role="buyer" onStatus={cancel} /> : tab === "favs" ? (
            favProducts?.length ? <div className="grid" style={st("--m:2;--d:3")}>{favProducts.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <Empty icon="ph-heart" title="مفيش منتجات في المفضلة" sub="اضغط على القلب في أي منتج عشان تحفظه هنا."><Link href="/search" className="btn">تصفّح المنتجات</Link></Empty>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}

export default function Account() { return <RequireLogin><Suspense><Body /></Suspense></RequireLogin>; }
