"use client";
import { useEffect, useState } from "react";
import { st } from "@/lib/style";
import { recommend } from "@/lib/reco";
import { useApp } from "@/lib/providers";
import { ProductCard } from "./Ui";
import type { Product } from "@/lib/types";

/** "مقترح لك" row — hidden until the shopper has some history. */
export function Recommended({ title = "مقترح لك", exclude = [], boostCat, n = 10, cols = 5 }: { title?: string; exclude?: string[]; boostCat?: string; n?: number; cols?: number }) {
  const { items } = useApp();
  const [list, setList] = useState<Product[] | null>(null);
  const key = exclude.join(",") + "|" + (boostCat || "");
  useEffect(() => {
    let live = true;
    const run = () => recommend(n, { exclude: [...exclude, ...items.map((i) => i.productId)], boostCat }).then((r) => live && setList(r)).catch(() => live && setList([]));
    run();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!list?.length) return null;
  return (
    <section className="sec">
      <div className="sec-h"><h2><i className="ph ph-sparkle" style={{ color: "var(--gold)" }} /> {title}</h2></div>
      <small style={{ marginTop: -8 }}>على حسب المنتجات اللي شفتها وبحثت عنها</small>
      <div className="grid" style={st(`--m:2;--d:${cols}`)}>{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>
  );
}
