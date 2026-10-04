"use client";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { rangeText } from "@/lib/pricing";

export function Img({ src, ic = "ph-image", ratio = 1, className = "", style }: { src?: string; ic?: string; ratio?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`img ${className}`} style={{ aspectRatio: String(ratio), ...style }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <i className={`ph ${ic}`} />}
    </div>
  );
}

export function ProductCard({ p, verified }: { p: Product; verified?: boolean }) {
  return (
    <Link href={`/product/${p.id}`} className="pc">
      <Img src={p.images?.[0]} ic="ph-package" ratio={1} />
      <div className="bodyc">
        <span className="nm">{p.name}</span>
        <div className="price">{rangeText(p)} ج.م <small>/ {p.unit}</small></div>
        <small>أقل طلب: {p.moq} {p.unit}</small>
        <div className="row g4 wrap">
          {verified && <span className="bd v"><i className="ph ph-seal-check" />موثّق</span>}
          <small>{p.governorate}</small>
        </div>
      </div>
    </Link>
  );
}

export function Empty({ icon = "ph-tray", title, sub, children }: { icon?: string; title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="empty"><i className={`ph ${icon}`} /><b style={{ color: "var(--tx)", fontSize: 18 }}>{title}</b>{sub && <p>{sub}</p>}{children}</div>;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="grid" style={{ ["--m" as string]: 2, ["--d" as string]: rows }}>{Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" style={{ minHeight: 220 }} />)}</div>;
}

export function Status({ s }: { s: string }) {
  const m: Record<string, [string, string]> = {
    active: ["منشور", "v"], pending: ["قيد المراجعة", "w"], hidden: ["مخفي", "g"],
    approved: ["مقبول", "v"], rejected: ["مرفوض", "e"], open: ["مفتوح", "v"], closed: ["مغلق", "g"],
    new: ["جديد", "w"], confirmed: ["مؤكد", ""], shipped: ["تم الشحن", ""], delivered: ["تم التسليم", "v"], cancelled: ["ملغي", "e"], accepted: ["مقبول", "v"],
  };
  const [t, c] = m[s] ?? [s, "g"];
  return <span className={`bd ${c}`}>{t}</span>;
}
