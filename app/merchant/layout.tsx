"use client";
import { Panel } from "@/components/Panel";
import { RequireMerchant } from "@/components/Guard";

const links = [
  { href: "/merchant", t: "نظرة عامة", ic: "ph-chart-bar" },
  { href: "/merchant/products", t: "منتجاتي", ic: "ph-package" },
  { href: "/merchant/orders", t: "الطلبات", ic: "ph-receipt" },
  { href: "/merchant/rfqs", t: "طلبات عروض الأسعار", ic: "ph-clipboard-text" },
  { href: "/merchant/profile", t: "بيانات المتجر", ic: "ph-storefront" },
];
export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <RequireMerchant><Panel title="لوحة التاجر" links={links}>{children}</Panel></RequireMerchant>;
}
