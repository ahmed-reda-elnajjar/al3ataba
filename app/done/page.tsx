"use client";
import { isTransfer } from "@/lib/config";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/lib/providers";

function Body() {
  const sp = useSearchParams();
  const { settings } = useApp();
  const nos = (sp.get("no") || "").split(",").filter(Boolean);
  return (
    <div className="wc col" style={{ maxWidth: 520, alignItems: "center", textAlign: "center", paddingTop: 40 }}>
      <i className="ph ph-check-circle" style={{ fontSize: 80, color: "var(--pa)" }} />
      <h1>تم استلام طلبك</h1>
      {nos.length > 0 && <p>رقم الطلب: <b>{nos.join(" ، ")}</b></p>}
      <p className="mu">الطلب وصل للتاجر وهيتواصل معاك للتأكيد. تقدر تتابع حالته من حسابك.</p>
      {isTransfer(sp.get("pay") || "") && <div className="alert" style={{ textAlign: "start" }}>{settings.paymentInstructions}</div>}
      <Link href="/account" className="btn blk">تابع طلباتي</Link>
      <Link href="/" style={{ color: "var(--pm)" }}>ارجع للرئيسية</Link>
    </div>
  );
}

export default function Done() { return <Suspense><Body /></Suspense>; }
