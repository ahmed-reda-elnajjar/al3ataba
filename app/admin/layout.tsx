"use client";
import { Panel } from "@/components/Panel";
import { RequireAdmin } from "@/components/Guard";

const links = [
  { href: "/admin", t: "نظرة عامة", ic: "ph-chart-bar" },
  { href: "/admin/products", t: "المنتجات", ic: "ph-package" },
  { href: "/admin/categories", t: "الأقسام", ic: "ph-squares-four" },
  { href: "/admin/merchants", t: "التجار", ic: "ph-storefront" },
  { href: "/admin/orders", t: "الطلبات", ic: "ph-receipt" },
  { href: "/admin/rfqs", t: "طلبات عروض الأسعار", ic: "ph-clipboard-text" },
  { href: "/admin/settings", t: "الإعدادات", ic: "ph-gear" },
];
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin><Panel title="لوحة الإدارة" links={links}>{children}</Panel></RequireAdmin>;
}
