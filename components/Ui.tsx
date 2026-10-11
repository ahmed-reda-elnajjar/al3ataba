"use client";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { priceFor, rangeText } from "@/lib/pricing";
import { useApp } from "@/lib/providers";
import { useFavs } from "@/lib/favs";
import { isVideoUrl, videoPoster } from "@/lib/img";
import { sized } from "@/lib/media";
import { track } from "@/lib/reco";

export function Img({ src, ic = "ph-image", ratio = 1, className = "", style, w = 600 }: { src?: string; ic?: string; ratio?: number; className?: string; style?: React.CSSProperties; w?: number }) {
  return (
    <div className={`img ${className}`} style={{ aspectRatio: String(ratio), ...style }}>
      {src ? <img src={sized(src, w)} alt="" loading="lazy" decoding="async" /> : <i className={`ph ${ic}`} />}
    </div>
  );
}

export function ProductCard({ p: raw, verified }: { p: Product; verified?: boolean }) {
  const { add, items, withPromo } = useApp();
  const p = withPromo(raw);
  const favs = useFavs();
  const inCart = items.some((i) => i.productId === p.id);
  const quick = () => { track("cart", p); add({ id: p.id, productId: p.id, name: p.name, merchantId: p.merchantId, merchant: p.merchantName, qty: p.moq, price: priceFor(p.tiers, p.moq), image: p.images?.[0], unit: p.unit, moq: p.moq, tiers: p.tiers, cod: p.cod, ...(p.promo ? { promo: p.promo.label } : {}) }); };
  const fav = favs.has(p.id);
  const coverVideo = p.media?.[0] && isVideoUrl(p.media[0]) ? p.media[0] : "";
  return (
    <div className="pc">
      <button className={`ico fav${fav ? " on" : ""}`} aria-label="المفضلة" onClick={() => { if (!fav) track("fav", p); favs.toggle(p.id); }}><i className={`ph${fav ? "-fill" : ""} ph-heart`} /></button>
      <Link href={`/product/${p.id}`} style={{ position: "relative", display: "block" }}>
        <Img src={coverVideo ? videoPoster(coverVideo) : p.images?.[0]} ic="ph-package" ratio={1} w={420} />
        {coverVideo && <span className="vbadge"><i className="ph ph-play" /></span>}
        {p.promo && <span className="pbadge" style={p.promo.color ? { background: p.promo.color } : undefined}><i className="ph-fill ph-tag" />{p.promo.label}</span>}
      </Link>
      <div className="bodyc">
        <Link href={`/product/${p.id}`} className="nm">{p.name}</Link>
        <div className="row g4 wrap">
          {verified && <span className="bd v"><i className="ph ph-seal-check" />موثّق</span>}
          <small style={{ fontSize: 12 }}>{(p.packSize ?? 0) > 1 ? `${p.unit} ${p.packSize} قطعة` : `أقل طلب ${p.moq} ${p.unit}`}</small>
        </div>
        <div className="foot">
          <div className="sp price">{rangeText(p)} <small>ج.م{(p.packSize ?? 0) > 1 ? ` / ${p.unit}` : ""}</small>{p.origTiers && <s className="was">{p.origTiers[0].price}</s>}</div>
          <button className="add" aria-label="أضف للسلة" title={inCart ? "في السلة" : `أضف ${p.moq} ${p.unit} للسلة`} onClick={quick}><i className={`ph ${inCart ? "ph-check" : "ph-plus"}`} /></button>
        </div>
      </div>
    </div>
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
