"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/providers";
import { waLink } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { listCategories } from "@/lib/store";

export function Announcement() {
  const { settings } = useApp();
  return settings.announcement ? <div className="top">{settings.announcement}</div> : null;
}


export function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const { isAdmin, loggedIn, merchant, signOut } = useApp();
  const [tab, setTab] = useState<"menu" | "cats">("menu");
  const { data: cats } = useAsync(listCategories, []);
  useEffect(() => { onClose(); /* close on navigation */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const L = ({ href, ic, t }: { href: string; ic: string; t: string }) => <Link href={href} className="dl" onClick={onClose}><i className={`ph ${ic}`} />{t}</Link>;
  return (
    <div className={`dr ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="dr-bg" onClick={onClose} />
      <aside className="dr-box" role="dialog" aria-label="القائمة">
        <div className="row" style={{ marginBottom: 8 }}>
          <Link href="/" className="logo" onClick={onClose}><b>العتبة</b><small>AL3ATABA</small></Link>
          <span className="sp" />
          <button className="dr-x" onClick={onClose} aria-label="إغلاق"><i className="ph ph-x" /></button>
        </div>
        <div className="dr-tabs">
          <button className={tab === "menu" ? "on" : ""} onClick={() => setTab("menu")}>قائمة</button>
          <button className={tab === "cats" ? "on" : ""} onClick={() => setTab("cats")}>التصنيفات</button>
        </div>
        {tab === "menu" ? (
          <nav className="col g4">
            <L href="/" ic="ph-house" t="الرئيسية" />
            <L href="/search" ic="ph-squares-four" t="المنتجات" />
            <L href="/suppliers" ic="ph-storefront" t="التجار والمصانع" />
            <L href="/rfq" ic="ph-clipboard-text" t="اطلب عرض سعر" />
            <L href="/cart" ic="ph-shopping-cart" t="السلة" />
            <L href={loggedIn ? "/account" : "/login"} ic="ph-user" t={loggedIn ? "حسابي وطلباتي" : "تسجيل الدخول"} />
            {merchant?.status === "approved" ? <L href="/merchant" ic="ph-storefront" t="لوحة التاجر" /> : <L href="/sell" ic="ph-handshake" t="بيع معانا" />}
            <L href="/help" ic="ph-question" t="مساعدة" />
            {isAdmin ? (
              <>
                <div className="dr-sep" />
                <b className="dr-h">الإدارة</b>
                <L href="/admin" ic="ph-chart-bar" t="لوحة الإدارة" />
                <L href="/admin/products/new" ic="ph-plus-circle" t="إضافة منتج" />
                <L href="/admin/products" ic="ph-package" t="إدارة المنتجات" />
                <L href="/admin/categories" ic="ph-list-numbers" t="الأقسام وترتيبها" />
                <L href="/admin/orders" ic="ph-receipt" t="الطلبات" />
                <L href="/admin/merchants" ic="ph-users-three" t="التجار" />
                <L href="/admin/settings" ic="ph-gear" t="إعدادات الموقع" />
              </>
            ) : null}
            {loggedIn && <button className="dl" onClick={() => { signOut(); onClose(); }}><i className="ph ph-sign-out" />تسجيل خروج</button>}
          </nav>
        ) : (
          <nav className="col g4">
            <L href="/search" ic="ph-squares-four" t="كل المنتجات" />
            {(cats ?? []).map((c) => <L key={c.id} href={`/search?cat=${c.id}`} ic={c.icon || "ph-package"} t={c.name} />)}
            {cats && !cats.length && <small className="mu" style={{ padding: 12 }}>لسه مفيش أقسام.</small>}
            {isAdmin && <><div className="dr-sep" /><L href="/admin/categories" ic="ph-plus-circle" t="إضافة / حذف / ترتيب الأقسام" /></>}
          </nav>
        )}
      </aside>
    </div>
  );
}

export function Header() {
  const router = useRouter();
  const { count, loggedIn, isAdmin, merchant } = useApp();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const go = (e: React.FormEvent) => { e.preventDefault(); router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search"); };
  const panel = isAdmin ? { href: "/admin", t: "الإدارة", ic: "ph-gear" } : merchant?.status === "approved" ? { href: "/merchant", t: "متجري", ic: "ph-storefront" } : null;
  return (
    <header className="hdr">
      <Drawer open={menu} onClose={() => setMenu(false)} />
      <div className="in-row">
        <button className="burger sm" onClick={() => setMenu(true)} aria-label="القائمة"><i className="ph ph-list" /></button>
        <Link href="/" className="logo"><b>العتبة</b><small>AL3ATABA</small></Link>
        <form className="srch hm" onSubmit={go}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج… مثال: كوبايات" aria-label="بحث" />
          <button type="submit" aria-label="بحث"><i className="ph ph-magnifying-glass" /></button>
        </form>
        <div className="sp sm" />
        <Link href="/rfq" className="btn hm">اطلب عرض سعر</Link>
        <nav className="nav" style={{ marginInlineStart: "auto" }}>
          {panel && <Link href={panel.href} className="nl"><i className={`ph ${panel.ic}`} /><span className="hm">{panel.t}</span></Link>}
          {!panel && <Link href="/sell" className="nl hm"><i className="ph ph-storefront" />بيع معانا</Link>}
          <Link href="/cart" className="nl"><i className="ph ph-shopping-cart" />{count > 0 && <span className="cnt">{count}</span>}<span className="hm">السلة</span></Link>
          <Link href={loggedIn ? "/account" : "/login"} className="nl"><i className="ph ph-user" /><span className="hm">{loggedIn ? "حسابي" : "دخول"}</span></Link>
        </nav>
      </div>
      <form className="srch sm" style={{ marginTop: 10 }} onSubmit={go}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج" aria-label="بحث" />
        <button type="submit" aria-label="بحث"><i className="ph ph-magnifying-glass" /></button>
      </form>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="ft hm" style={{ display: undefined }}>
      <div className="grid" style={{ ["--d" as string]: 4, maxWidth: 1200, margin: "auto", width: "100%" }}>
        <div className="col g8"><Link href="/" className="logo"><b>العتبة</b><small>AL3ATABA</small></Link><span>سوق الجملة المصري. بتشتري من المصنع والتاجر مباشرة.</span></div>
        <div className="col g4"><b>العتبة</b><Link href="/suppliers">التجار</Link><Link href="/sell">سجّل كتاجر</Link><Link href="/rfq">اطلب عرض سعر</Link></div>
        <div className="col g4"><b>مساعدة</b><Link href="/help">مركز المساعدة</Link><Link href="/legal/returns">سياسة المرتجعات</Link><Link href="/account">طلباتي</Link></div>
        <div className="col g4"><b>قانوني</b><Link href="/legal/terms">الشروط والأحكام</Link><Link href="/legal/privacy">سياسة الخصوصية</Link></div>
      </div>
    </footer>
  );
}

export function WhatsApp() {
  const { settings } = useApp();
  if (!settings.whatsapp) return null;
  return <a className="wa" href={waLink(settings.whatsapp, "مرحباً، عندي استفسار بخصوص العتبة")} target="_blank" rel="noreferrer"><i className="ph ph-whatsapp-logo" /><span className="hm">دعم واتساب</span></a>;
}

export function BottomNav() {
  const p = usePathname();
  const { count, loggedIn } = useApp();
  const on = (r: string) => (p.startsWith(r) ? "on" : "");
  return (
    <nav className="bn sm">
      <Link href="/" className={p === "/" ? "on" : ""}><i className="ph ph-house" />الرئيسية</Link>
      <Link href="/search" className={on("/search")}><i className="ph ph-squares-four" />المنتجات</Link>
      <Link href="/rfq" className={on("/rfq")}><i className="ph ph-clipboard-text" />عرض سعر</Link>
      <Link href="/cart" className={on("/cart")}><i className="ph ph-shopping-cart" />{count > 0 && <span className="cnt">{count}</span>}السلة</Link>
      <Link href={loggedIn ? "/account" : "/login"} className={on("/account") || on("/login")}><i className="ph ph-user" />{loggedIn ? "حسابي" : "دخول"}</Link>
    </nav>
  );
}
