"use client";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { fmt, ms } from "@/lib/format";
import { withId } from "@/lib/store";
import { Empty, Status } from "@/components/Ui";
import type { Order } from "@/lib/types";

export default function Merchant() {
  const { user, merchant } = useApp();
  const { data, loading } = useAsync(async () => {
    const uid = user?.uid ?? "";
    const [p, o] = await Promise.all([
      getDocs(query(collection(dbI(), "products"), where("merchantId", "==", uid))),
      getDocs(query(collection(dbI(), "orders"), where("merchantId", "==", uid))),
    ]);
    const orders = o.docs.map((d) => withId<Order>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    return {
      products: p.size, orders,
      fresh: orders.filter((x) => x.status === "new").length,
      shipping: orders.filter((x) => x.status === "confirmed" || x.status === "shipped").length,
      sales: orders.filter((x) => x.status !== "cancelled").reduce((a, x) => a + (x.subtotal || 0), 0),
    };
  }, [user?.uid]);
  if (loading || !data) return <div className="skel" />;
  return (
    <>
      <div className="dash">
        <div className="row"><div className="sp"><small>مرحباً،</small><h2>{merchant?.name}</h2></div>{merchant?.verified ? <span className="bd v"><i className="ph ph-seal-check" />موثّق</span> : <span className="bd w">غير موثّق</span>}</div>
        <div><small>إجمالي المبيعات</small><div className="big">{fmt(data.sales)} ج.م</div></div>
        <div className="stats">
          <div><b>{data.orders.length}</b><small>الطلبات</small></div>
          <div><b>{data.fresh}</b><small>جديدة</small></div>
          <div><b>{data.products}</b><small>المنتجات</small></div>
        </div>
      </div>
      <div className="row wrap"><Link className="btn" href="/merchant/products/new"><i className="ph ph-plus" />إضافة منتج جديد</Link><Link className="btn o" href="/merchant/rfqs">طلبات عروض الأسعار</Link></div>
      <div className="sec-h"><h2>أحدث الطلبات</h2><Link href="/merchant/orders">عرض الكل</Link></div>
      {!data.orders.length ? <Empty icon="ph-receipt" title="لسه مفيش طلبات" /> : (
        <div className="menu">
          {data.orders.slice(0, 6).map((o) => (
            <Link key={o.id} href="/merchant/orders">
              <span className="mi"><i className="ph ph-receipt" /></span>
              <span className="sp col g4"><b style={{ direction: "ltr", textAlign: "right" }}>#{o.orderNo}</b><small>{o.items.length} منتج · {o.buyerName}</small></span>
              <span className="col g4" style={{ alignItems: "flex-end" }}><b className="price">{fmt(o.total)} ج.م</b><Status s={o.status} /></span>
            </Link>
          ))}
        </div>
      )}
      {data.shipping > 0 && <div className="alert">عندك {data.shipping} طلب محتاج متابعة شحن.</div>}
    </>
  );
}
