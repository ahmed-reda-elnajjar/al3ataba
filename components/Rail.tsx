"use client";
import { useEffect, useRef, useState } from "react";

/** Horizontal row you can swipe (phone) or move with arrows (desktop). RTL aware. */
export function Rail({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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
  return (
    <div className={`rail ${className}`}>
      {!edge.start && <button className="rail-btn prev" aria-label="السابق" onClick={() => move(-1)}><i className="ph ph-caret-right" /></button>}
      <div className="rail-track" ref={ref}>{children}</div>
      {!edge.end && <button className="rail-btn next" aria-label="التالي" onClick={() => move(1)}><i className="ph ph-caret-left" /></button>}
    </div>
  );
}
