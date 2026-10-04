"use client";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { fmt } from "@/lib/format";
import type { Order } from "@/lib/types";

export default function Admin() {
  const { data, loading } = useAsync(async () => {
    const db = dbI();
    const [p, pp, m, mp, o, r] = await Promise.all([
      getDocs(query(collection(db, "products"), where("status", "==", "active"))),
      getDocs(query(collection(db, "products"), where("status", "==", "pending"))),
      getDocs(query(collection(db, "merchants"), where("status", "==", "approved"))),
      getDocs(query(collection(db, "merchants"), where("status", "==", "pending"))),
      getDocs(collection(db, "orders")),
      getDocs(query(collection(db, "rfqs"), where("status", "==", "open"))),
    ]);
    const orders = o.docs.map((d) => d.data() as Order);
    return {
      products: p.size, pendingProducts: pp.size, merchants: m.size, pendingMerchants: mp.size,
      orders: orders.length, newOrders: orders.filter((x) => x.status === "new").length,
      gmv: orders.filter((x) => x.status !== "cancelled").reduce((a, x) => a + (x.total || 0), 0), rfqs: r.size,
    };
  }, []);
  if (loading || !data) return <div className="skel" />;
  const S = ({ n, t, href }: { n: string | number; t: string; href: string }) => <Link href={href} className="stat"><b>{n}</b><small>{t}</small></Link>;
  return (
    <>
      <div className="grid" style={{ ["--m" as string]: 2, ["--d" as string]: 4 }}>
        <S n={data.newOrders} t="طلبات جديدة" href="/admin/orders" />
        <S n={data.pendingMerchants} t="تجار منتظرين مراجعة" href="/admin/merchants" />
        <S n={data.pendingProducts} t="منتجات منتظرة مراجعة" href="/admin/products" />
        <S n={data.rfqs} t="طلبات عروض مفتوحة" href="/admin/rfqs" />
        <S n={data.products} t="منتجات منشورة" href="/admin/products" />
        <S n={data.merchants} t="تجار معتمدين" href="/admin/merchants" />
        <S n={data.orders} t="كل الطلبات" href="/admin/orders" />
        <S n={`${fmt(data.gmv)} ج.م`} t="قيمة الطلبات (غير الملغية)" href="/admin/orders" />
      </div>
      <div className="card col"><b>ابدأ من هنا</b>
        <div className="row wrap"><Link className="btn" href="/admin/products/new">+ إضافة منتج</Link><Link className="btn o" href="/admin/categories">إدارة الأقسام</Link><Link className="btn o" href="/admin/settings">إعدادات الموقع</Link></div>
      </div>
    </>
  );
}
