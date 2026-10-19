"use client";
import { useEffect, useRef, useState } from "react";

/** Horizontal row you can swipe (phone) or move with arrows (desktop). RTL aware.
 *  auto = moves by itself one card every few seconds and starts over at the end; pauses while the user touches/hovers it. */
export function Rail({ children, className = "", auto = 0 }: { children: React.ReactNode; className?: string; auto?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const check = () => {
    const el = ref.current; if (!el) return;
    const x = Math.abs(el.scrollLeft), max = el.scrollWidth - el.clientWidth;
    setEdge({ start: x < 4, end: x > max - 4 });
  };
  useEffect(() => {
    check();
    const el = ref.current; if (!el) return;
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [children]);
  const rtl = typeof document !== "undefined" && document.dir === "rtl";
  const move = (dir: 1 | -1) => { const el = ref.current; if (el) el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" }); };
  const paused = useRef(false);
  useEffect(() => {
    if (!auto) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      const el = ref.current; if (!el || paused.current || document.hidden) return;
      const max = el.scrollWidth - el.clientWidth; if (max < 8) return;
      const card = (el.firstElementChild as HTMLElement | null)?.offsetWidth || el.clientWidth / 3;
      const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
      if (Math.abs(el.scrollLeft) >= max - 4) el.scrollTo({ left: 0, behavior: "smooth" }); // back to the first card
      else el.scrollBy({ left: (rtl ? -1 : 1) * (card + gap), behavior: "smooth" });
    }, auto);
    return () => clearInterval(id);
  }, [auto, rtl]);
  const hold = { onMouseEnter: () => { paused.current = true; }, onMouseLeave: () => { paused.current = false; }, onTouchStart: () => { paused.current = true; }, onTouchEnd: () => { setTimeout(() => { paused.current = false; }, 4000); } };
  return (
    <div className={`rail ${className}`} {...(auto ? hold : {})}>
      {!edge.start && <button className="rail-btn prev" aria-label="السابق" onClick={() => move(-1)}><i className="ph ph-caret-right" /></button>}
      <div className="rail-track" ref={ref}>{children}</div>
      {!edge.end && <button className="rail-btn next" aria-label="التالي" onClick={() => move(1)}><i className="ph ph-caret-left" /></button>}
    </div>
  );
}
