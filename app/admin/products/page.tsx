"use client";
import { sized } from "@/lib/media";
import Link from "next/link";
import { useState } from "react";
import { collection, deleteDoc, doc, getDocs, limit, query, updateDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { ms } from "@/lib/format";
import { Empty, Status } from "@/components/Ui";
import { rangeText } from "@/lib/pricing";
import type { Product } from "@/lib/types";

export default function AdminProducts() {
  const { data, loading, reload } = useAsync(async () => {
    const s = await getDocs(query(collection(dbI(), "products"), limit(500)));
    return s.docs.map((d) => withId<Product>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }, []);
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const set = async (p: Product, status: string) => { await updateDoc(doc(dbI(), "products", p.id), { status }); reload(); };
  const del = async (p: Product) => { if (confirm(`حذف "${p.name}" نهائيًا؟`)) { await deleteDoc(doc(dbI(), "products", p.id)); reload(); } };
  const list = (data ?? []).filter((p) => (f === "all" || p.status === f) && (!q || p.name.includes(q)));
  return (
    <>
      <div className="row wrap"><b className="sp" style={{ fontSize: 18 }}>المنتجات ({data?.length ?? 0})</b><Link className="btn" href="/admin/products/new">+ إضافة منتج</Link></div>
      <div className="row wrap">
        {[["all", "الكل"], ["active", "منشور"], ["pending", "قيد المراجعة"], ["hidden", "مخفي"]].map(([k, t]) => <button key={k} className={`chip ${f === k ? "on" : ""}`} onClick={() => setF(k)}>{t}</button>)}
        <input className="in" style={{ maxWidth: 220 }} placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <div className="skel" /> : !list.length ? <Empty icon="ph-package" title="مفيش منتجات" sub="ابدأ بإضافة أول منتج." /> : (
        <div className="col">
          {list.map((p) => (
            <div key={p.id} className="card row wrap">
              {p.images?.[0] ? <img className="ph-thumb" src={sized(p.images[0], 120)} alt="" loading="lazy" /> : <div className="ph-thumb" />}
              <div className="sp" style={{ minWidth: 160 }}><b>{p.name}</b><br /><small>{p.merchantName} · {p.categoryName} · {rangeText(p)} ج.م</small></div>
              <Status s={p.status} />
              <Link className="btn o sm2" href={`/admin/products/${p.id}`}>تعديل</Link>
              {p.status !== "active" ? <button className="btn sm2" onClick={() => set(p, "active")}>نشر</button> : <button className="btn o sm2" onClick={() => set(p, "hidden")}>إخفاء</button>}
              <button className="btn r sm2" onClick={() => del(p)}>حذف</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
