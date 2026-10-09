"use client";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { fmt } from "@/lib/format";
import type { Order } from "@/lib/types";

const MENU = [
  { href: "/admin/merchants", t: "إدارة التجار", ic: "ph-users-three", k: "pendingMerchants" },
  { href: "/admin/products", t: "إدارة المنتجات", ic: "ph-package", k: "pendingProducts" },
  { href: "/admin/orders", t: "الطلبات", ic: "ph-receipt", k: "newOrders" },
  { href: "/admin/categories", t: "الأقسام وترتيبها", ic: "ph-list-numbers", k: "" },
  { href: "/admin/import", t: "استيراد منتجات من تليجرام", ic: "ph-telegram-logo", k: "" },
  { href: "/admin/rfqs", t: "طلبات عروض الأسعار", ic: "ph-clipboard-text", k: "rfqs" },
  { href: "/admin/settings", t: "الإعدادات والبانر", ic: "ph-gear", k: "" },
] as const;

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
  return (
    <>
      <div className="grid" style={{ ["--m" as string]: 3, ["--d" as string]: 4 }}>
        <div className="stat"><small>إجمالي الطلبات</small><b>{fmt(data.orders)}</b></div>
        <div className="stat"><small>التجار</small><b>{fmt(data.merchants)}</b></div>
        <div className="stat"><small>المنتجات</small><b>{fmt(data.products)}</b></div>
        <div className="stat hm"><small>قيمة الطلبات</small><b>{fmt(data.gmv)} ج.م</b></div>
      </div>
      <Link className="btn blk" href="/admin/products/new"><i className="ph ph-plus" />إضافة منتج جديد</Link>
      <div className="menu">
        {MENU.map((x) => {
          const n = x.k ? (data as Record<string, number>)[x.k] : 0;
          return <Link key={x.href} href={x.href}><span className="mi"><i className={`ph ${x.ic}`} /></span><span className="sp">{x.t}</span>{n > 0 && <span className="bd w">{n} جديد</span>}<i className="ph ph-caret-left chev" /></Link>;
        })}
      </div>
    </>
  );
}
