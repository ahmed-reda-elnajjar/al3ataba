"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoBig } from "@/components/Brand";

const TYPES = [
  { k: "buyer", t: "مشتري (أفراد / شركات)", d: "تسوق من كل الأسواق بالجملة", ic: "ph-user" },
  { k: "merchant", t: "تاجر (محل / مصنع / شركة)", d: "اعرض منتجاتك لآلاف العملاء", ic: "ph-storefront" },
];

function Body() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [k, setK] = useState("buyer");
  const go = () => router.push(`/login?reg=1&next=${encodeURIComponent(k === "merchant" ? "/sell" : next)}`);
  return (
    <div className="auth">
      <div className="row"><button className="ico" onClick={() => router.back()} aria-label="رجوع"><i className="ph ph-arrow-right" /></button></div>
      <div className="head"><LogoBig /></div>
      <div className="col g4"><h2>إنشاء حساب جديد</h2><small>انضم إلى آلاف التجار والمشترين</small></div>
      {TYPES.map((x) => (
        <button key={x.k} className={`acct${k === x.k ? " on" : ""}`} onClick={() => setK(x.k)}>
          <span className="mi"><i className={`ph ${x.ic}`} /></span>
          <span className="sp col g4"><b>{x.t}</b><small>{x.d}</small></span>
          <span className="opt" style={{ border: 0, padding: 0, background: "none" }}><span className="ck" style={k === x.k ? { background: "var(--pa)", borderColor: "var(--pa)", color: "#fff" } : undefined}>{k === x.k && <i className="ph ph-check" />}</span></span>
        </button>
      ))}
      <button className="btn blk" onClick={go}>متابعة</button>
      <p className="c" style={{ fontSize: 15 }}>لديك حساب بالفعل؟ <Link href={`/login?next=${encodeURIComponent(next)}`} style={{ color: "var(--pm)", fontWeight: 700, textDecoration: "underline" }}>تسجيل الدخول</Link></p>
    </div>
  );
}

export default function Signup() { return <Suspense><Body /></Suspense>; }
