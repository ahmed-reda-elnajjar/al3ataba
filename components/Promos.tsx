"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skyline } from "./Brand";
import { readInterest } from "@/lib/reco";
import { useApp } from "@/lib/providers";
import { isLive, personalCatOrder, promoCats, promoLabel } from "@/lib/promos";
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

/** Categories ordered for this shopper (offers first, then their interests) + which ones have an offer. */
export function usePersonalCats<T extends { id: string; order?: number }>(cats: T[]) {
  const { promos } = useApp();
  const [interest, setInterest] = useState<Record<string, number>>({});
  useEffect(() => {
    const read = () => setInterest(readInterest().cats || {});
    read();
    window.addEventListener("interest", read);
    return () => window.removeEventListener("interest", read);
  }, []);
  const list = useMemo(() => personalCatOrder(cats, promos, interest), [cats, promos, interest]);
  const offers = useMemo(() => promoCats(promos), [promos]);
  return { list, offers };
}

/** Top-of-home slider: the main banner first, then one full-size slide per running offer. Auto-rotates, swipeable. */
export function HeroSlider() {
  const { promos, settings } = useApp();
  const live = promos.filter((p) => isLive(p));
  const n = live.length + 1;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const x0 = useRef<number | null>(null);
  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setTimeout(() => setI((v) => (v + 1) % n), 5000);
    return () => clearTimeout(t);
  }, [i, n, paused]);
  const go = (d: number) => setI((v) => (v + d + n) % n);
  return (
    <section className="hslide" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { x0.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => { const s = x0.current; x0.current = null; setPaused(false); if (s == null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 40) go(dx > 0 ? 1 : -1); }}>
      <div className="hs-track" style={{ transform: `translateX(${i * 100}%)` }}>
        <div className="hero2 hs-item" aria-hidden={i !== 0}>
          {settings.heroImage ? <img className="bg" src={sized(settings.heroImage, 1600)} alt="" /> : <Skyline className="sky" />}
          <div className="sh" />
          <div className="tx">
            <h1>{settings.heroTitle || "منتجات الجملة بأسعار حقيقية"}</h1>
            <p>{settings.heroSub || "من كل أسواق مصر .. في مكان واحد"}</p>
            <Link href="/search" className="btn gd sm2" style={{ minHeight: 42, padding: "0 22px" }} tabIndex={i === 0 ? 0 : -1}>تسوق الآن</Link>
          </div>
        </div>
        {live.map((pr, k) => (
          <Link key={pr.id} href={`/offers?id=${pr.id}`} className="hero2 hs-item" aria-hidden={i !== k + 1} tabIndex={i === k + 1 ? 0 : -1} style={!pr.image && pr.color ? { background: pr.color } : undefined}>
            {pr.image ? <img className="bg" src={sized(pr.image, 1600)} alt="" loading={k ? "lazy" : undefined} /> : <Skyline className="sky" />}
            <div className="sh" />
            <div className="tx">
              <span className="hs-off"><i className="ph-fill ph-tag" /> {promoLabel(pr)}</span>
              <h1>{pr.title}</h1>
              {pr.sub && <p>{pr.sub}</p>}
              <span className="btn gd sm2" style={{ minHeight: 42, padding: "0 22px" }}>تسوق العرض{left(pr) ? ` · ${left(pr)}` : ""}</span>
            </div>
          </Link>
        ))}
      </div>
      {n > 1 && <>
        <button className="hs-nav prev" aria-label="السابق" onClick={() => go(-1)}><i className="ph ph-caret-right" /></button>
        <button className="hs-nav next" aria-label="التالي" onClick={() => go(1)}><i className="ph ph-caret-left" /></button>
        <div className="hs-dots">{Array.from({ length: n }).map((_, k) => <button key={k} className={k === i ? "on" : ""} aria-label={`شريحة ${k + 1}`} onClick={() => setI(k)} />)}</div>
      </>}
    </section>
  );
}
