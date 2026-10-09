"use client";
import Link from "next/link";
import { useState } from "react";
import { useAsync } from "@/lib/hooks";
import { listCategories, sampleCategory } from "@/lib/store";
import { Empty, Img } from "@/components/Ui";

export default function Categories() {
  const [q, setQ] = useState("");
  const { data, loading } = useAsync(async () => {
    // 3 product names per category as the subtitle (a few reads per category, not the whole catalogue)
    const cats = await listCategories();
    const samples = await Promise.all(cats.map((c) => sampleCategory(c.id, 3).catch(() => [])));
    return cats.map((c, i) => ({ ...c, sample: samples[i].map((p) => p.name).join(" - ") }));
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
              <Img src={c.image} ic={c.icon} ratio={1} w={160} />
              <div className="sp">
                <b style={{ fontSize: 16 }}>{c.name}</b>
                <small style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sample || "لسه مفيش منتجات"}</small>
              </div>
              <i className="ph ph-caret-left" style={{ color: "#b3a789" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
