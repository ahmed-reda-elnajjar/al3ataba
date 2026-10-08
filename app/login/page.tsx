"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, RecaptchaVerifier, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPhoneNumber, signInWithPopup, type ConfirmationResult,
} from "firebase/auth";
import { authI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { LogoBig } from "@/components/Brand";
import Link from "next/link";

const toE164 = (v: string) => { const d = v.replace(/\D/g, ""); return d.startsWith("20") ? `+${d}` : `+20${d.replace(/^0/, "")}`; };
const msg = (e: unknown) => {
  const c = (e as { code?: string })?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "الإيميل أو كلمة المرور غلط.";
  if (c.includes("email-already-in-use")) return "الإيميل ده مسجّل قبل كده، جرّب تسجيل الدخول.";
  if (c.includes("weak-password")) return "كلمة المرور ضعيفة (6 حروف على الأقل).";
  if (c.includes("popup-closed")) return "اتقفلت نافذة جوجل قبل ما تخلّص.";
  if (c.includes("operation-not-allowed")) return "طريقة الدخول دي مش مفعّلة في إعدادات Firebase.";
  if (c.includes("invalid-phone") || c.includes("too-many")) return "الرقم غير صحيح أو حاولت كتير، جرّب بعد شوية.";
  if (c.includes("unauthorized-domain")) return "دومين الموقع مش مضاف في Firebase (Authentication ← Settings ← Authorized domains).";
  if (c.includes("configuration-not-found")) return "خدمة Authentication لسه ماتفعّلتش في Firebase. ادخل Authentication واضغط Get started.";
  if (c.includes("popup-blocked")) return "المتصفح منع نافذة جوجل. اسمح بالنوافذ المنبثقة وجرّب تاني.";
  if (c.includes("cancelled-popup")) return "اتفتحت أكتر من نافذة. جرّب تاني.";
  if (c.includes("network-request-failed")) return "مشكلة في الإنترنت أو في الاتصال بـ Firebase.";
  if (c.includes("api-key") || c.includes("invalid-api-key")) return "مفتاح Firebase غير صحيح.";
  return "حصلت مشكلة، جرّب تاني." + (c ? ` (${c})` : "");
};

function Form() {
  const { loggedIn, user, signOut } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [tab, setTab] = useState<"email" | "phone">("email");
  const [reg, setReg] = useState(useSearchParams().get("reg") === "1");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [conf, setConf] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const verifier = useRef<RecaptchaVerifier | null>(null);
  useEffect(() => () => { verifier.current?.clear(); verifier.current = null; }, []);

  const run = async (fn: () => Promise<unknown>, go = true) => {
    setBusy(true); setError(""); setInfo("");
    try { await fn(); if (go) router.push(next); } catch (e) { setError(msg(e)); }
    setBusy(false);
  };
  const google = () => run(() => signInWithPopup(authI(), new GoogleAuthProvider()));
  const emailGo = () => run(() => (reg ? createUserWithEmailAndPassword(authI(), email.trim(), pass) : signInWithEmailAndPassword(authI(), email.trim(), pass)));
  const reset = () => run(async () => { await sendPasswordResetEmail(authI(), email.trim()); setInfo("بعتنالك رابط تغيير كلمة المرور على الإيميل."); }, false);
  const sendCode = () => run(async () => {
    const auth = authI(); auth.languageCode = "ar";
    verifier.current ??= new RecaptchaVerifier(auth, "recaptcha", { size: "invisible" });
    try { setConf(await signInWithPhoneNumber(auth, toE164(phone), verifier.current)); }
    catch (e) { verifier.current?.clear(); verifier.current = null; throw e; }
  }, false);
  const verify = () => run(async () => { if (conf) await conf.confirm(code); });

  if (loggedIn) {
    return (
      <div className="wc" style={{ maxWidth: 440 }}><div className="card col mt">
        <h2>أنت مسجّل دخول</h2>
        <p className="mu" style={{ direction: "ltr", textAlign: "right" }}>{user?.email || user?.phoneNumber}</p>
        <button className="btn blk" onClick={() => router.push(next)}>كمّل</button>
        <button className="btn o blk" onClick={() => signOut()}>تسجيل خروج</button>
      </div></div>
    );
  }
  return (
    <div className="auth">
      <div className="head"><LogoBig /></div>
      <div className="col g4 c"><h2>{reg ? "إنشاء حساب جديد" : "مرحباً بك مجدداً"}</h2><small>{reg ? "انضم إلى آلاف التجار والمشترين" : "سجّل دخولك للمتابعة"}</small></div>
      <div className="seg"><button className={tab === "email" ? "on" : ""} onClick={() => setTab("email")}>البريد الإلكتروني</button><button className={tab === "phone" ? "on" : ""} onClick={() => setTab("phone")}>رقم الهاتف</button></div>
      {tab === "email" ? (
        <>
          <input className="in" type="email" placeholder="البريد الإلكتروني" style={{ direction: "ltr", textAlign: "right" }} value={email} onChange={(e) => setEmail(e.target.value)} aria-label="البريد الإلكتروني" />
          <input className="in" type="password" placeholder="كلمة المرور" style={{ direction: "ltr", textAlign: "right" }} value={pass} onChange={(e) => setPass(e.target.value)} aria-label="كلمة المرور" />
          {!reg && <span style={{ color: "var(--mu)", cursor: "pointer", fontSize: 14 }} onClick={() => email.includes("@") ? reset() : setError("اكتب الإيميل الأول")}>نسيت كلمة المرور؟</span>}
          <button className="btn blk" disabled={busy || !email.includes("@") || pass.length < 6} onClick={emailGo}>{busy ? "…" : reg ? "إنشاء الحساب" : "تسجيل الدخول"}</button>
        </>
      ) : (
        <>
          <input className="in" inputMode="tel" placeholder="رقم الهاتف 01012345678" style={{ direction: "ltr", textAlign: "right" }} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!conf} aria-label="رقم الهاتف" />
          {conf && <input className="in" inputMode="numeric" maxLength={6} placeholder="كود التأكيد" style={{ direction: "ltr", textAlign: "center", letterSpacing: "0.4em" }} value={code} onChange={(e) => setCode(e.target.value)} aria-label="كود التأكيد" />}
          <button className="btn blk" disabled={busy || (!conf && phone.replace(/\D/g, "").length < 10)} onClick={conf ? verify : sendCode}>{busy ? "…" : conf ? "تسجيل الدخول" : "ابعتلي كود التأكيد"}</button>
          <div id="recaptcha" />
        </>
      )}
      {error && <p className="err">{error}</p>}{info && <p className="ok">{info}</p>}
      <div className="or">أو</div>
      <button className="btn o blk" disabled={busy} onClick={google}><i className="ph ph-google-logo" />الدخول بحساب Google</button>
      <p className="c" style={{ fontSize: 15 }}>
        {reg ? <>لديك حساب بالفعل؟ <span style={{ color: "var(--pm)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }} onClick={() => setReg(false)}>تسجيل الدخول</span></>
          : <>ليس لديك حساب؟ <Link href={`/signup?next=${encodeURIComponent(next)}`} style={{ color: "var(--pm)", fontWeight: 700, textDecoration: "underline" }}>إنشاء حساب جديد</Link></>}
      </p>
    </div>
  );
}

export default function Login() { return <Suspense><Form /></Suspense>; }
