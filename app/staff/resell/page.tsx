"use client";
/* Area for a team member who manages "البيع بالعمولة" only (no other admin access). */
import { Suspense } from "react";
import Link from "next/link";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { RequireLogin } from "@/components/Guard";
import { Empty } from "@/components/Ui";
import { ResellAdmin } from "@/components/ResellAdmin";

function Body() {
  const { user } = useApp();
  const { data, loading } = useAsync(async () => {
    if (!user) return null;
    const r = await fetch("/api/staff/me", { cache: "no-store", headers: { "x-firebase-token": await user.getIdToken() } });
    return (await r.json().catch(() => ({}))) as { role: string | null; name: string };
  }, [user?.uid]);
  if (loading) return <div className="wc"><div className="skel" /></div>;
  if (!data?.role) return <div className="wc"><Empty icon="ph-lock" title="مش عندك صلاحية على الصفحة دي" sub="لو المفروض تكون مدير قسم البيع بالعمولة، اطلب من الإدارة تضيف إيميلك أو رقمك."><Link href="/" className="btn">الرئيسية</Link></Empty></div>;
  return (
    <div className="wc">
      <small className="mu">{data.name ? `أهلاً ${data.name} — ` : ""}{data.role === "admin" ? "إدارة رئيسية" : "مدير قسم البيع بالعمولة"}</small>
      <div className="mt"><ResellAdmin base="/staff/resell" /></div>
    </div>
  );
}

export default function Page() {
  return <RequireLogin why="سجّل دخولك بالحساب اللي الإدارة ضافته."><Suspense fallback={<div className="wc"><div className="skel" /></div>}><Body /></Suspense></RequireLogin>;
}
