import Link from "next/link";

export const metadata = { title: "الصفحة مش موجودة | العتبة أونلاين" };

export default function NotFound() {
  return (
    <div className="wc" style={{ minHeight: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: "40px 16px" }}>
      <i className="ph ph-magnifying-glass" style={{ fontSize: 48, color: "var(--pa)" }} />
      <h1 style={{ fontSize: 24 }}>الصفحة دي مش موجودة</h1>
      <p className="mu">ممكن يكون اللينك اتغيّر أو القسم/المنتج اتشال.</p>
      <div className="row wrap" style={{ justifyContent: "center", gap: 8 }}>
        <Link href="/" className="btn">الرئيسية</Link>
        <Link href="/categories" className="btn o">كل الأقسام</Link>
        <Link href="/search" className="btn o">ابحث عن منتج</Link>
      </div>
    </div>
  );
}
