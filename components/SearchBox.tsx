"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { listActiveProducts, listCategories } from "@/lib/store";
import { rangeText } from "@/lib/pricing";
import type { Category, Product } from "@/lib/types";

// Normalise Arabic so "أ/إ/ا", "ة/ه", "ى/ي" and diacritics match each other.
export const norm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/\s+/g, " ").trim();

// Loaded once per page visit and shared by every search box.
let cache: Promise<{ products: Product[]; cats: Category[] }> | null = null;
const load = () => (cache ??= Promise.all([listActiveProducts(), listCategories()]).then(([products, cats]) => ({ products, cats })).catch(() => { cache = null; return { products: [], cats: [] }; }));

export function SearchBox({ className, style }: { className: string; style?: React.CSSProperties }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ products: Product[]; cats: Category[] } | null>(null);
  const [hi, setHi] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const terms = norm(q).split(" ").filter(Boolean);
  const res = useMemo(() => {
    if (!data || !terms.length) return { products: [] as Product[], cats: [] as Category[], words: [] as string[] };
    const hit = (txt: string) => terms.every((t) => txt.includes(t));
    const products = data.products
      .map((p) => ({ p, n: norm(p.name), all: norm(`${p.name} ${p.categoryName} ${p.merchantName} ${(p.keywords || []).join(" ")}`) }))
      .filter((x) => hit(x.all))
      .sort((a, b) => Number(b.n.startsWith(terms[0])) - Number(a.n.startsWith(terms[0])))
      .slice(0, 6).map((x) => x.p);
    const cats = data.cats.filter((c) => hit(norm(c.name))).slice(0, 3);
    // word completions taken from product names, e.g. "شم" → "شميز"
    const last = terms[terms.length - 1];
    const words = Array.from(new Set(data.products.flatMap((p) => p.name.split(/\s+/)).filter((w) => w.length > 2 && norm(w).startsWith(last) && norm(w) !== last))).slice(0, 4);
    return { products, cats, words };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q]);

  const go = (text = q) => { setOpen(false); const t = text.trim(); router.push(t ? `/search?q=${encodeURIComponent(t)}` : "/search"); };
  const items = [...res.words.map((w) => ({ k: "w" + w, href: "", word: [...q.trim().split(/\s+/).slice(0, -1), w].join(" ") })), ...res.cats.map((c) => ({ k: "c" + c.id, href: `/search?cat=${c.id}`, word: "" })), ...res.products.map((p) => ({ k: "p" + p.id, href: `/product/${p.id}`, word: "" }))];
  const pickIdx = (i: number) => { const it = items[i]; if (!it) return go(); if (it.word) { setQ(it.word); go(it.word); } else { setOpen(false); router.push(it.href); } };
  const show = open && q.trim().length > 0;

  return (
    <form ref={box} className={className} style={{ ...style, position: "relative", overflow: "visible" }} onSubmit={(e) => { e.preventDefault(); hi >= 0 ? pickIdx(hi) : go(); }}>
      <input value={q} placeholder="ابحث عن منتج أو سوق أو متجر" aria-label="بحث" autoComplete="off"
        onFocus={() => { setOpen(true); load().then(setData); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(-1); if (!data) load().then(setData); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      <button type="submit" aria-label="بحث"><i className="ph ph-magnifying-glass" /></button>
      {show && (
        <div className="sugg" role="listbox">
          {!data ? <div className="sg mu">جاري التحميل…</div> : (
            <>
              <button type="button" className="sg" onClick={() => go()}><i className="ph ph-magnifying-glass" /><span className="sp">ابحث عن «<b>{q.trim()}</b>»</span></button>
              {res.words.map((w, i) => { const full = [...q.trim().split(/\s+/).slice(0, -1), w].join(" "); return (
                <button type="button" key={w} className={`sg${hi === i ? " on" : ""}`} onMouseEnter={() => setHi(i)} onClick={() => { setQ(full); go(full); }}><i className="ph ph-arrow-up-left" /><span className="sp">{full}</span></button>
              ); })}
              {res.cats.map((c, j) => { const i = res.words.length + j; return (
                <Link key={c.id} href={`/search?cat=${c.id}`} className={`sg${hi === i ? " on" : ""}`} onMouseEnter={() => setHi(i)} onClick={() => setOpen(false)}><i className={`ph ${c.icon || "ph-squares-four"}`} /><span className="sp">{c.name}</span><small>قسم</small></Link>
              ); })}
              {res.products.map((p, j) => { const i = res.words.length + res.cats.length + j; return (
                <Link key={p.id} href={`/product/${p.id}`} className={`sg${hi === i ? " on" : ""}`} onMouseEnter={() => setHi(i)} onClick={() => setOpen(false)}>
                  {p.images?.[0] ? <img src={p.images[0]} alt="" /> : <i className="ph ph-package" />}
                  <span className="sp nm1">{p.name}</span><b className="price" style={{ fontSize: 13 }}>{rangeText(p)} ج.م</b>
                </Link>
              ); })}
              {!res.products.length && !res.cats.length && !res.words.length && <div className="sg mu">مفيش اقتراحات، اضغط بحث أو <Link href="/rfq" style={{ color: "var(--pm)", textDecoration: "underline" }}>اطلب المنتج</Link></div>}
            </>
          )}
        </div>
      )}
    </form>
  );
}
