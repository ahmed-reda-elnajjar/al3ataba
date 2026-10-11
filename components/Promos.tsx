"use client";
import Link from "next/link";
import { useApp } from "@/lib/providers";
import { isLive, promoLabel } from "@/lib/promos";
import { sized } from "@/lib/media";
import type { Promo } from "@/lib/types";

const left = (pr: Promo) => {
  if (!pr.endsAt) return "";
  const d = Math.ceil((new Date(`${pr.endsAt}T23:59:59`).getTime() - Date.now()) / 864e5);
  return d <= 1 ? "آخر يوم" : d <= 14 ? `باقي ${d} يوم` : "";
};

export function PromoCard({ pr }: { pr: Promo }) {
  const t = left(pr);
  return (
    <Link href={`/offers?id=${pr.id}`} className="promo-card" style={pr.color && !pr.image ? { background: pr.color } : undefined}>
      {pr.image && <img className="bg" src={sized(pr.image, 900)} alt="" loading="lazy" />}
      {pr.image && <span className="sh" />}
      {t && <span className="ends"><i className="ph ph-clock" /> {t}</span>}
      <span className="off">{promoLabel(pr)}</span>
      <h3>{pr.title}</h3>
      {pr.sub && <small>{pr.sub}</small>}
    </Link>
  );
}

/** Horizontal strip of the offers running now (home page). Renders nothing when there are none. */
export function PromoStrip() {
  const { promos } = useApp();
  const live = promos.filter((p) => isLive(p));
  if (!live.length) return null;
  return (
    <section>
      <div className="sec-h" style={{ marginBottom: 10 }}><h2><i className="ph-fill ph-tag" style={{ color: "#c0392b" }} /> العروض</h2><Link href="/offers">كل العروض</Link></div>
      <div className="promos">{live.map((pr) => <PromoCard key={pr.id} pr={pr} />)}</div>
    </section>
  );
}
