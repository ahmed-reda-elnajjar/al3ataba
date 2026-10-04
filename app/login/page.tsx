"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, RecaptchaVerifier, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPhoneNumber, signInWithPopup, type ConfirmationResult,
} from "firebase/auth";
import { authI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";

const toE164 = (v: string) => { const d = v.replace(/\D/g, ""); return d.startsWith("20") ? `+${d}` : `+20${d.replace(/^0/, "")}`; };
const msg = (e: unknown) => {
  const c = (e as { code?: string })?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "الإيميل أو كلمة المرور غلط.";
  if (c.includes("email-already-in-use")) return "الإيميل ده مسجّل قبل كده، جرّب تسجيل الدخول.";
  if (c.includes("weak-password")) return "كلمة المرور ضعيفة (6 حروف على الأقل).";
  if (c.includes("popup-closed")) return "اتقفلت نافذة جوجل قبل ما تخلّص.";
  if (c.includes("operation-not-allowed")) return "طريقة الدخول دي مش مفعّلة في إعدادات Firebase.";
  if (c.includes("invalid-phone") || c.includes("too-many")) return "الرقم غير صحيح أو حاولت كتير، جرّب بعد شوية.";
  return "حصلت مشكلة، جرّب تاني.";
};

function Form() {
  const { loggedIn, user, signOut } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [tab, setTab] = useState<"email" | "phone">("email");
  const [reg, setReg] = useState(false);
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
    <div className="wc" style={{ maxWidth: 440 }}>
      <div className="card col mt">
        <h2>{reg ? "إنشاء حساب" : "سجّل دخولك"}</h2>
        <button className="btn o blk" disabled={busy} onClick={google}><i className="ph ph-google-logo" />الدخول بحساب جوجل</button>
        <div className="row g8"><span className="chip" style={tab === "email" ? { background: "var(--pm)", color: "#fff" } : undefined} onClick={() => setTab("email")}>إيميل</span><span className="chip" style={tab === "phone" ? { background: "var(--pm)", color: "#fff" } : undefined} onClick={() => setTab("phone")}>موبايل</span></div>
        {tab === "email" ? (
          <>
            <div className="fld"><label>الإيميل</label><input className="in" type="email" style={{ direction: "ltr", textAlign: "right" }} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="fld"><label>كلمة المرور</label><input className="in" type="password" style={{ direction: "ltr", textAlign: "right" }} value={pass} onChange={(e) => setPass(e.target.value)} /></div>
            <button className="btn blk" disabled={busy || !email.includes("@") || pass.length < 6} onClick={emailGo}>{busy ? "…" : reg ? "إنشاء الحساب" : "دخول"}</button>
            <div className="row wrap"><span className="sp" style={{ color: "var(--pm)", cursor: "pointer" }} onClick={() => setReg(!reg)}>{reg ? "عندي حساب" : "مفيش عندي حساب"}</span>{!reg && <span style={{ color: "var(--mu)", cursor: "pointer" }} onClick={() => email.includes("@") ? reset() : setError("اكتب الإيميل الأول")}>نسيت كلمة المرور؟</span>}</div>
          </>
        ) : (
          <>
            <div className="fld"><label>رقم الموبايل</label><input className="in" inputMode="tel" style={{ direction: "ltr", textAlign: "right" }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" disabled={!!conf} /></div>
            {conf && <div className="fld"><label>كود التأكيد</label><input className="in" inputMode="numeric" maxLength={6} style={{ direction: "ltr", textAlign: "center", letterSpacing: "0.4em" }} value={code} onChange={(e) => setCode(e.target.value)} /></div>}
            <button className="btn blk" disabled={busy || (!conf && phone.replace(/\D/g, "").length < 10)} onClick={conf ? verify : sendCode}>{busy ? "…" : conf ? "دخول" : "ابعتلي الكود"}</button>
            <div id="recaptcha" />
          </>
        )}
        {error && <p className="err">{error}</p>}{info && <p className="ok">{info}</p>}
      </div>
    </div>
  );
}

export default function Login() { return <Suspense><Form /></Suspense>; }
