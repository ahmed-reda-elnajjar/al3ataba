"use client";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { fmt } from "@/lib/format";
import type { Order } from "@/lib/types";

export default function Merchant() {
  const { user, merchant } = useApp();
  const { data, loading } = useAsync(async () => {
    const uid = user?.uid ?? "";
    const [p, o] = await Promise.all([
      getDocs(query(collection(dbI(), "products"), where("merchantId", "==", uid))),
      getDocs(query(collection(dbI(), "orders"), where("merchantId", "==", uid))),
    ]);
    const orders = o.docs.map((d) => d.data() as Order);
    return { products: p.size, orders: orders.length, fresh: orders.filter((x) => x.status === "new").length, sales: orders.filter((x) => x.status !== "cancelled").reduce((a, x) => a + (x.subtotal || 0), 0) };
  }, [user?.uid]);
  if (loading || !data) return <div className="skel" />;
  return (
    <>
      <div className="alert">أهلاً {merchant?.name} {merchant?.verified ? "· متجر موثّق" : "· متجرك لسه غير موثّق، تواصل مع الإدارة للتوثيق"}</div>
      <div className="grid" style={{ ["--m" as string]: 2, ["--d" as string]: 4 }}>
        <Link href="/merchant/orders" className="stat"><b>{data.fresh}</b><small>طلبات جديدة</small></Link>
        <Link href="/merchant/orders" className="stat"><b>{data.orders}</b><small>كل الطلبات</small></Link>
        <Link href="/merchant/products" className="stat"><b>{data.products}</b><small>منتجاتي</small></Link>
        <div className="stat"><b>{fmt(data.sales)} ج.م</b><small>المبيعات (بدون الشحن)</small></div>
      </div>
      <div className="row wrap"><Link className="btn" href="/merchant/products/new">+ إضافة منتج</Link><Link className="btn o" href="/merchant/rfqs">شوف طلبات عروض الأسعار</Link></div>
    </>
  );
}
