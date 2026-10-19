"use client";
import Link from "next/link";
import { collection, getCountFromServer, getDocs, query, where } from "firebase/firestore";
import { useState } from "react";
import { useApp } from "@/lib/providers";
import { refreshCatalog } from "@/lib/catalogClient";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { fmt } from "@/lib/format";
import type { Order } from "@/lib/types";

const MENU = [
  { href: "/admin/insights", t: "لوحة المتابعة والتحليل (الحسابات، المستخدمين، المشاكل، المستشار الذكي)", ic: "ph-chart-line-up", k: "" },
  { href: "/admin/merchants", t: "إدارة التجار", ic: "ph-users-three", k: "pendingMerchants" },
  { href: "/admin/products?f=pending", t: "إدارة المنتجات ومراجعة المستورد", ic: "ph-package", k: "pendingProducts" },
  { href: "/admin/orders", t: "الطلبات", ic: "ph-receipt", k: "newOrders" },
  { href: "/admin/categories", t: "الأقسام وترتيبها", ic: "ph-list-numbers", k: "" },
  { href: "/admin/enhance", t: "تحسين الصور والأوصاف (خلفية بيضا + وصف احترافي)", ic: "ph-magic-wand", k: "" },
  { href: "/admin/promos", t: "العروض والخصومات على الأقسام والمنتجات", ic: "ph-tag", k: "" },
  { href: "/admin/resell", t: "البيع بالعمولة (البائعين وطلباتهم والسحب)", ic: "ph-hand-coins", k: "" },
  { href: "/admin/import", t: "استيراد منتجات من تليجرام", ic: "ph-telegram-logo", k: "" },
  { href: "/admin/import-site", t: "استيراد منتجات من موقع تاجر", ic: "ph-globe", k: "" },
  { href: "/admin/rfqs", t: "طلبات عروض الأسعار", ic: "ph-clipboard-text", k: "rfqs" },
  { href: "/admin/settings", t: "الإعدادات والبانر", ic: "ph-gear", k: "" },
] as const;

export default function Admin() {
  const { data, loading } = useAsync(async () => {
    const db = dbI();
    const [p, pp, m, mp, o, r] = await Promise.all([
      // counts only (1 read per 1000 docs) instead of downloading every product
      getCountFromServer(query(collection(db, "products"), where("status", "==", "active"))),
      getCountFromServer(query(collection(db, "products"), where("status", "==", "pending"))),
      getCountFromServer(query(collection(db, "merchants"), where("status", "==", "approved"))),
      getCountFromServer(query(collection(db, "merchants"), where("status", "==", "pending"))),
      getDocs(collection(db, "orders")),
      getDocs(query(collection(db, "rfqs"), where("status", "==", "open"))),
    ]);
    const orders = o.docs.map((d) => d.data() as Order);
    return {
      products: p.data().count, pendingProducts: pp.data().count, merchants: m.data().count, pendingMerchants: mp.data().count,
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
      <RefreshSite />
      <div className="menu">
        {MENU.map((x) => {
          const n = x.k ? (data as Record<string, number>)[x.k] : 0;
          return <Link key={x.href} href={x.href}><span className="mi"><i className={`ph ${x.ic}`} /></span><span className="sp">{x.t}</span>{n > 0 && <span className="bd w">{n} جديد</span>}<i className="ph ph-caret-left chev" /></Link>;
        })}
      </div>
    </>
  );
}

/** Visitors read a cached copy of the catalogue (saves Firebase reads). Edits refresh it within ~10 minutes; this button does it now. */
function RefreshSite() {
  const { user } = useApp();
  const [msg, setMsg] = useState("");
  const go = async () => {
    if (!user) return;
    setMsg("جاري التحديث…");
    const w = await refreshCatalog(user, true);
    setMsg(w === 0 ? "تم ✓ — الزوار هيشوفوا آخر التعديلات خلال دقايق." : w > 0 ? `اتحدّث من شوية — جرّب تاني بعد ${w} ثانية.` : "مقدرتش أحدّث، جرّب تاني.");
  };
  return (
    <div className="card row wrap" style={{ gap: 10 }}>
      <small className="sp mu">الزوار بيشوفوا نسخة محفوظة من المنتجات عشان نوفّر قراءات Firebase. تعديلاتك بتظهر لهم تلقائياً خلال حوالي 10 دقايق.</small>
      <button className="btn o sm2" onClick={go}><i className="ph ph-arrows-clockwise" />حدّث الموقع للزوار دلوقتي</button>
      {msg && <small className="ok">{msg}</small>}
    </div>
  );
}
