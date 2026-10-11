"use client";
import { useEffect, useState } from "react";
import { Mark, Skyline } from "./Brand";

/* Short intro (≈2.8s, skippable) shown once per visit: the arch logo, the old market skyline
 * and the famous Ataba crowd — porters with boxes on their heads, shoppers with bags — walking past. */
const KEY = "al3ataba-splash";
const DURATION = 2800;

type P = { left: number; s: number; d: number; delay: number; c: string; kind: "box" | "bag" | "plain"; rev?: boolean };
const CROWD: P[] = [
  { left: 4, s: 1, d: 5.5, delay: 0, c: "#c9a66b", kind: "box" },
  { left: 16, s: 0.8, d: 6.5, delay: -1, c: "#f4eee2", kind: "bag", rev: true },
  { left: 27, s: 0.95, d: 5, delay: -2.5, c: "#b08a4f", kind: "plain" },
  { left: 38, s: 0.75, d: 7, delay: -0.5, c: "#e9dcc2", kind: "box", rev: true },
  { left: 49, s: 1.05, d: 6, delay: -3, c: "#c9a66b", kind: "bag" },
  { left: 60, s: 0.85, d: 5.8, delay: -1.8, c: "#f4eee2", kind: "plain", rev: true },
  { left: 70, s: 0.95, d: 6.4, delay: -4, c: "#b08a4f", kind: "box" },
  { left: 81, s: 0.78, d: 5.2, delay: -2.2, c: "#e9dcc2", kind: "bag", rev: true },
  { left: 91, s: 1, d: 6.8, delay: -0.8, c: "#c9a66b", kind: "plain" },
  { left: 10, s: 0.7, d: 7.5, delay: -3.5, c: "#e9dcc2", kind: "plain", rev: true },
  { left: 33, s: 0.9, d: 5.4, delay: -4.2, c: "#c9a66b", kind: "bag" },
  { left: 55, s: 0.72, d: 7.2, delay: -2.8, c: "#b08a4f", kind: "box", rev: true },
  { left: 76, s: 1.1, d: 5.6, delay: -1.2, c: "#f4eee2", kind: "box" },
  { left: 97, s: 0.8, d: 6.2, delay: -3.3, c: "#e9dcc2", kind: "bag", rev: true },
];

function Person({ c, kind }: { c: string; kind: P["kind"] }) {
  return (
    <svg viewBox="0 0 24 46" width="24" height="46" aria-hidden="true">
      {kind === "box" && <rect x="4" y="0" width="16" height="9" rx="1.5" fill="#8a6a3c" stroke="#c9a66b" strokeWidth="1" />}
      <circle cx="12" cy={kind === "box" ? 14 : 8} r="4.2" fill={c} />
      <path d={kind === "box" ? "M6 33 C6 22 8 19 12 19 C16 19 18 22 18 33Z" : "M6 31 C6 18 8 14 12 14 C16 14 18 18 18 31Z"} fill={c} />
      <g className="legs" stroke={c} strokeWidth="2.6" strokeLinecap="round">
        <path className="l1" d="M10 32 L8.5 45" /><path className="l2" d="M14 32 L15.5 45" />
      </g>
      {kind === "bag" && <rect x="17.5" y="22" width="6" height="8" rx="1.2" fill="#c0392b" />}
      {kind === "box" && <path d="M7 19 L5 8 M17 19 L19 8" stroke={c} strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

export function Splash() {
  const [state, setState] = useState<"on" | "out" | "off">("on");
  useEffect(() => {
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY); sessionStorage.setItem(KEY, "1"); } catch {}
    if (seen) { setState("off"); return; }
    document.body.style.overflow = "hidden";
    const t1 = setTimeout(() => setState("out"), DURATION);
    return () => { clearTimeout(t1); document.body.style.overflow = ""; };
  }, []);
  useEffect(() => {
    if (state !== "out") return;
    document.body.style.overflow = "";
    const t = setTimeout(() => setState("off"), 450);
    return () => clearTimeout(t);
  }, [state]);
  if (state === "off") return null;
  return (
    <div className={`splash${state === "out" ? " out" : ""}`} role="dialog" aria-label="العتبة أونلاين">
      <button className="sp-skip" onClick={() => setState("out")}>تخطي</button>
      <div className="sp-center">
        <div className="sp-mark"><span className="sp-ring" /><Mark size={96} light /></div>
        <b className="sp-title">العتبة أونلاين</b>
        <small className="sp-en">ATABA ONLINE</small>
        <p className="sp-tag">زحمة العتبة وكل أسواق مصر .. في موبايلك</p>
        <div className="sp-pills">
          <span><i className="ph ph-tag" />أسعار جملة</span>
          <span><i className="ph ph-factory" />من المصنع والتاجر</span>
          <span><i className="ph ph-truck" />توصيل لكل مصر</span>
        </div>
      </div>
      <div className="sp-street">
        <Skyline className="sp-sky" />
        <div className="sp-crowd">
          {CROWD.map((p, i) => (
            <span key={i} className={`sp-p${p.rev ? " rev" : ""}`} style={{ left: `${p.left}%`, ["--s" as string]: p.s, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }}>
              <Person c={p.c} kind={p.kind} />
            </span>
          ))}
        </div>
      </div>
      <span className="sp-bar" style={{ animationDuration: `${DURATION}ms` }} />
    </div>
  );
}
