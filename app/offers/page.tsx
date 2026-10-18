"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { st } from "@/lib/style";
import { useApp } from "@/lib/providers";
import { isLive, promoLabel } from "@/lib/promos";
import { pageActiveProducts, productsByIds, type Cursor } from "@/lib/store";
import { sized } from "@/lib/media";
import { PromoCard } from "@/components/Promos";
import { Empty, Loading, ProductCard } from "@/components/Ui";
import type { Product, Promo } from "@/lib/types";

const PAGE = 24;
type Src = { cat: string; cursor: Cursor; more: boolean };

function PromoProducts({ pr }: { pr: Promo }) {
  const [items, setItems] = useState<Product[]>([]);
  const [srcs, setSrcs] = useState<Src[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const loadFrom = async (list: Src[], first: boolean) => {
    const res = await Promise.all(list.map((s) => (s.more || first ? pageActiveProducts(PAGE, { cat: s.cat || undefined, after: s.cursor }) : null)));
    const add: Product[] = [];
    const next = list.map((s, i) => {
      const r = res[i];
      if (!r) return s;
      add.push(...r.items);
      return { cat: s.cat, cursor: r.cursor, more: r.more };
    });
    setSrcs(next);
    setItems((old) => { const seen = new Set(old.map((p) => p.id)); return [...old, ...add.filter((p) => !seen.has(p.id))]; });
  };

  useEffect(() => {
    let live = true;
    setItems([]); setLoading(true); setErr("");
    (async () => {
      if (pr.scope === "products") { const ps = await productsByIds(pr.productIds); if (live) setItems(ps); return; }
      const list: Src[] = (pr.scope === "all" ? [""] : pr.categoryIds).map((cat) => ({ cat, cursor: null, more: true }));
      await loadFrom(list, true);
    })().catch((e) => live && setErr(String(e?.message || e))).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pr.id]);

  const more = srcs.some((s) => s.more);
  if (loading) return <Loading />;
  if (err) return <Empty icon="ph-warning" title="حصلت مشكلة في التحميل" sub={err} />;
  if (!items.length) return <Empty icon="ph-tag" title="مفيش منتجات في العرض ده دلوقتي" />;
  return (
    <>
      <div className="grid" style={st("--m:2;--d:5")}>{items.map((p) => <ProductCard key={p.id} p={p} showPromo />)}</div>
      {more && <div className="row" style={{ justifyContent: "center", marginTop: 16 }}><button className="btn o" onClick={() => { setLoading(false); loadFrom(srcs, false); }}>عرض المزيد</button></div>}
    </>
  );
}

function Offers() {
  const id = useSearchParams().get("id") || "";
  const { promos, isAdmin } = useApp();
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 2500); return () => clearTimeout(t); }, []);
  const live = promos.filter((p) => isLive(p));
  const pr = id ? promos.find((p) => p.id === id) : undefined;

  if (id) {
    if (!pr) return <div className="wc">{!ready && !promos.length ? <Loading rows={2} /> : <Empty icon="ph-tag" title="العرض ده مش موجود"><Link href="/offers" className="btn">كل العروض</Link></Empty>}</div>;
    const on = isLive(pr);
    return (
      <div className="wc">
        <small><Link href="/">الرئيسية</Link> › <Link href="/offers">العروض</Link></small>
        <section className="hero2 mt" style={{ marginBottom: 18, background: pr.image ? undefined : pr.color || undefined }}>
          {pr.image && <img className="bg" src={sized(pr.image, 1600)} alt="" />}
          <div className="sh" />
          <div className="tx">
            <span className="bd" style={{ background: "var(--gold)", color: "#fff", alignSelf: "flex-start", fontSize: 15 }}>{promoLabel(pr)}</span>
            <h1>{pr.title}</h1>
            {pr.sub && <p>{pr.sub}</p>}
            {pr.endsAt && <p style={{ fontSize: 13 }}><i className="ph ph-clock" /> العرض لحد {pr.endsAt}</p>}
          </div>
        </section>
        {!on && <div className="alert" style={{ marginBottom: 14 }}>العرض ده مش شغال دلوقتي{isAdmin ? " (متوقف أو خارج التاريخ) — الأسعار اللي تحت من غير خصم." : "."}</div>}
        <PromoProducts pr={pr} />
      </div>
    );
  }

  return (
    <div className="wc">
      <div className="sec-h" style={{ marginBottom: 14 }}><h1 style={{ fontSize: 24, flex: 1 }}><i className="ph-fill ph-tag" style={{ color: "#c0392b" }} /> العروض</h1>{isAdmin && <Link href="/admin/promos">إدارة العروض</Link>}</div>
      {!live.length ? (
        !ready && !promos.length ? <Loading rows={2} /> : <Empty icon="ph-tag" title="مفيش عروض شغالة دلوقتي" sub="تابعنا، العروض الجديدة بتنزل هنا.">{isAdmin && <Link href="/admin/promos" className="btn">أضف عرض</Link>}</Empty>
      ) : (
        <div className="grid" style={st("--m:1;--d:2;gap:14px")}>{live.map((p) => <PromoCard key={p.id} pr={p} />)}</div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="wc"><Loading /></div>}><Offers /></Suspense>;
}
