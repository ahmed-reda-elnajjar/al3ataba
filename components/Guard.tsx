"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/providers";
import { Empty } from "./Ui";

export function RequireLogin({ children, why = "سجّل دخولك الأول عشان تكمّل." }: { children: React.ReactNode; why?: string }) {
  const { ready, loggedIn } = useApp();
  const path = usePathname();
  if (!ready) return <div className="wc"><div className="skel" /></div>;
  if (!loggedIn) {
    return (
      <div className="wc"><Empty icon="ph-lock" title="محتاج تسجّل دخولك" sub={why}>
        <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn">تسجيل الدخول</Link>
      </Empty></div>
    );
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { ready, loggedIn, isAdmin } = useApp();
  const path = usePathname();
  if (!ready) return <div className="wc"><div className="skel" /></div>;
  if (!loggedIn) return <div className="wc"><Empty icon="ph-lock" title="دخول الإدارة"><Link href={`/login?next=${encodeURIComponent(path)}`} className="btn">تسجيل الدخول</Link></Empty></div>;
  if (!isAdmin) return <div className="wc"><Empty icon="ph-prohibit" title="مش مسموح لك تدخل هنا" sub="الصفحة دي للإدارة فقط. اتأكد إنك داخل بالإيميل الصحيح وإنه متأكد (Verified)." /></div>;
  return <>{children}</>;
}

export function RequireMerchant({ children }: { children: React.ReactNode }) {
  const { ready, loggedIn, merchant } = useApp();
  const path = usePathname();
  if (!ready) return <div className="wc"><div className="skel" /></div>;
  if (!loggedIn) return <div className="wc"><Empty icon="ph-lock" title="دخول التاجر"><Link href={`/login?next=${encodeURIComponent(path)}`} className="btn">تسجيل الدخول</Link></Empty></div>;
  if (!merchant) return <div className="wc"><Empty icon="ph-storefront" title="مفيش متجر على حسابك" sub="سجّل متجرك الأول وفريق العتبة هيراجعه."><Link href="/sell" className="btn">سجّل كتاجر</Link></Empty></div>;
  if (merchant.status === "pending") return <div className="wc"><Empty icon="ph-hourglass" title="طلبك قيد المراجعة" sub="هنفعّل متجرك أول ما فريق العتبة يراجع بياناتك." /></div>;
  if (merchant.status === "rejected") return <div className="wc"><Empty icon="ph-x-circle" title="تم رفض طلب التسجيل" sub="تواصل مع الدعم لو محتاج توضيح." /></div>;
  return <>{children}</>;
}
