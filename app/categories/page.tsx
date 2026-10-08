"use client";
import Link from "next/link";
import { useState } from "react";
import { useAsync } from "@/lib/hooks";
import { listActiveProducts, listCategories } from "@/lib/store";
import { Empty, Img } from "@/components/Ui";

export default function Categories() {
  const [q, setQ] = useState("");
  const { data, loading } = useAsync(async () => {
    const [cats, products] = await Promise.all([listCategories(), listActiveProducts()]);
    return cats.map((c) => {
      const mine = products.filter((p) => p.categoryId === c.id);
      return { ...c, count: mine.length, sample: mine.slice(0, 3).map((p) => p.name).join(" - ") };
    });
  }, []);
  const list = (data ?? []).filter((c) => !q.trim() || c.name.includes(q.trim()));
  return (
    <div className="wc" style={{ maxWidth: 820 }}>
      <h1 style={{ marginBottom: 12 }}>الأقسام</h1>
      <div className="srch" style={{ marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في الأقسام" aria-label="ابحث في الأقسام" />
        <button type="button" aria-label="بحث"><i className="ph ph-magnifying-glass" /></button>
      </div>
      {loading ? <div className="skel" /> : !list.length ? <Empty icon="ph-squares-four" title="مفيش أقسام" /> : (
        <div className="col" style={{ gap: 10 }}>
          {list.map((c) => (
            <Link key={c.id} href={`/search?cat=${c.id}`} className="catrow">
              <Img src={c.image} ic={c.icon} ratio={1} />
              <div className="sp">
                <b style={{ fontSize: 16 }}>{c.name}</b>
                <small style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sample || "لسه مفيش منتجات"}</small>
              </div>
              <span className="bd g">{c.count}</span>
              <i className="ph ph-caret-left" style={{ color: "#b3a789" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
