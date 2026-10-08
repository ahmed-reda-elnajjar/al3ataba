"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/providers";
import { waLink } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { listCategories } from "@/lib/store";
import { Logo, LogoBig, MarketArt, Skyline } from "./Brand";

export function Announcement() {
  const { settings } = useApp();
  return settings.announcement ? <div className="top">{settings.announcement}</div> : null;
}

/* Pages that use their own full-screen layout (no header/footer chrome on mobile). */
const BARE = ["/login", "/signup"];

export function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const { isAdmin, loggedIn, merchant, signOut } = useApp();
  const [tab, setTab] = useState<"menu" | "cats">("menu");
  const { data: cats } = useAsync(listCategories, []);
  useEffect(() => { onClose(); // close on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const L = ({ href, ic, t, img }: { href: string; ic: string; t: string; img?: string }) => (
    <Link href={href} className="dl" onClick={onClose}>{img ? <img src={img} alt="" /> : <i className={`ph ${ic}`} />}{t}</Link>
  );
  return (
    <div className={`dr ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="dr-bg" onClick={onClose} />
      <aside className="dr-box" role="dialog" aria-label="القائمة">
        <div className="row" style={{ marginBottom: 8 }}>
          <Logo onClick={onClose} size={34} />
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
            <L href="/categories" ic="ph-squares-four" t="الأقسام" />
            <L href="/search" ic="ph-package" t="كل المنتجات" />
            <L href="/suppliers" ic="ph-storefront" t="التجار والمصانع" />
            <L href="/rfq" ic="ph-clipboard-text" t="طلب منتج / عرض سعر" />
            <L href="/cart" ic="ph-shopping-cart" t="السلة" />
            <L href={loggedIn ? "/account" : "/login"} ic="ph-user" t={loggedIn ? "حسابي" : "تسجيل الدخول"} />
            {merchant?.status === "approved" ? <L href="/merchant" ic="ph-storefront" t="لوحة التاجر" /> : <L href="/sell" ic="ph-handshake" t="بيع معانا" />}
            <L href="/help" ic="ph-question" t="المساعدة" />
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
            <L href="/categories" ic="ph-squares-four" t="كل الأقسام" />
            {(cats ?? []).map((c) => <L key={c.id} href={`/search?cat=${c.id}`} ic={c.icon || "ph-package"} t={c.name} img={c.image} />)}
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
  const path = usePathname();
  const { count, loggedIn, isAdmin, merchant, settings } = useApp();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const go = (e: React.FormEvent) => { e.preventDefault(); router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search"); };
  const panel = isAdmin ? { href: "/admin", t: "الإدارة", ic: "ph-gear" } : merchant?.status === "approved" ? { href: "/merchant", t: "متجري", ic: "ph-storefront" } : null;
  const bare = BARE.some((b) => path.startsWith(b));
  return (
    <header className={`hdr${bare ? " hm" : ""}`}>
      <Drawer open={menu} onClose={() => setMenu(false)} />
      <div className="in-row">
        <button className="burger" onClick={() => setMenu(true)} aria-label="القائمة"><i className="ph ph-list" /></button>
        <Logo light size={36} />
        <form className="srch hm" onSubmit={go} style={{ maxWidth: 620 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج أو سوق أو متجر" aria-label="بحث" />
          <button type="submit" aria-label="بحث"><i className="ph ph-magnifying-glass" /></button>
        </form>
        <span className="sp" />
        <span className="loc sm"><i className="ph ph-map-pin" />{settings.city || "القاهرة"}</span>
        <nav className="nav hm">
          {panel ? <Link href={panel.href} className="nl"><i className={`ph ${panel.ic}`} />{panel.t}</Link> : <Link href="/sell" className="nl"><i className="ph ph-storefront" />بيع معانا</Link>}
          <Link href="/rfq" className="nl"><i className="ph ph-clipboard-text" />طلب منتج</Link>
          <Link href="/cart" className="nl"><i className="ph ph-shopping-cart" />{count > 0 && <span className="cnt">{count}</span>}السلة</Link>
          <Link href={loggedIn ? "/account" : "/login"} className="nl"><i className="ph ph-user" />{loggedIn ? "حسابي" : "دخول"}</Link>
        </nav>
      </div>
      <form className="srch sm" style={{ marginTop: 10 }} onSubmit={go}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج أو سوق أو متجر" aria-label="بحث" />
        <button type="submit" aria-label="بحث"><i className="ph ph-magnifying-glass" /></button>
      </form>
      <nav className="hdr-links hm">
        <Link href="/categories">الأقسام</Link><Link href="/search">كل المنتجات</Link><Link href="/suppliers">التجار والمصانع</Link><Link href="/rfq">طلب عرض سعر</Link><Link href="/help">المساعدة</Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="ft">
      <div className="grid" style={{ ["--m" as string]: 2, ["--d" as string]: 4, maxWidth: 1240, margin: "auto", width: "100%" }}>
        <div className="col g8" style={{ gridColumn: "span 2" }}>
          <Logo light size={42} />
          <span>من كل أسواق مصر .. في مكان واحد. منصة تجارة جملة بين البائع والمشتري.</span>
          <b style={{ color: "var(--gold2)", fontFamily: "Alexandria" }}>مش مجرد متجر .. ده أسواق مصر</b>
        </div>
        <div className="col g4"><b>العتبة</b><Link href="/categories">الأقسام</Link><Link href="/suppliers">التجار</Link><Link href="/sell">سجّل كتاجر</Link><Link href="/rfq">اطلب عرض سعر</Link></div>
        <div className="col g4"><b>مساعدة</b><Link href="/help">مركز المساعدة</Link><Link href="/legal/returns">المرتجعات</Link><Link href="/legal/terms">الشروط</Link><Link href="/legal/privacy">الخصوصية</Link></div>
      </div>
      <Skyline />
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
      <Link href="/categories" className={on("/categories") || on("/search")}><i className="ph ph-squares-four" />الأقسام</Link>
      <Link href="/rfq" className={on("/rfq")}><i className="ph ph-clipboard-text" />طلب منتج</Link>
      <Link href="/cart" className={on("/cart") || on("/checkout")}><i className="ph ph-shopping-cart" />{count > 0 && <span className="cnt">{count}</span>}السلة</Link>
      <Link href={loggedIn ? "/account" : "/login"} className={on("/account") || on("/login")}><i className="ph ph-dots-three-circle" />المزيد</Link>
    </nav>
  );
}

/* First-visit welcome (splash + onboarding), shown once per device. */
export function Welcome() {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    try { if (!localStorage.getItem("al3ataba-welcome")) setStep(0); } catch {}
  }, []);
  const done = () => { try { localStorage.setItem("al3ataba-welcome", "1"); } catch {} setStep(-1); };
  if (step < 0) return null;
  return (
    <div className="wel sm" role="dialog" aria-label="مرحباً">
      <button className="skip" onClick={done}>تخطي</button>
      {step === 0 ? (
        <>
          <LogoBig />
          <h2>من كل أسواق مصر .. في مكان واحد</h2>
          <p className="mu">منصة تجارة جملة بين البائع والمشتري</p>
          <div className="feat">
            <div><i className="ph ph-tag" />أسعار الجملة</div>
            <div><i className="ph ph-truck" />توصيل</div>
            <div><i className="ph ph-shield-check" />أمان</div>
          </div>
          <Skyline className="sky" />
          <button className="btn" onClick={() => setStep(1)}>ابدأ الآن</button>
        </>
      ) : (
        <>
          <MarketArt />
          <h2>تسوق من أكبر الأسواق</h2>
          <p className="mu" style={{ maxWidth: 340 }}>العتبة، الموسكي، باب الشعرية، القنطرة، المحلة، المنصورة وغيرهم الكتير.. منتجات من المصنع والتاجر مباشرة.</p>
          <div className="dots" style={{ margin: "6px 0" }}><i /><i className="on" /></div>
          <button className="btn" onClick={done}>التالي</button>
        </>
      )}
    </div>
  );
}
