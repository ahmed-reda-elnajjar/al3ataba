"use client";
import { sized } from "@/lib/media";
import Link from "next/link";
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { ms } from "@/lib/format";
import { rangeText } from "@/lib/pricing";
import { Empty, Status } from "@/components/Ui";
import type { Product } from "@/lib/types";

export default function MerchantProducts() {
  const { user } = useApp();
  const { data, loading, reload } = useAsync(async () => {
    const s = await getDocs(query(collection(dbI(), "products"), where("merchantId", "==", user?.uid ?? "")));
    return s.docs.map((d) => withId<Product>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }, [user?.uid]);
  const toggle = async (p: Product) => { await updateDoc(doc(dbI(), "products", p.id), { status: p.status === "hidden" ? "active" : "hidden" }); reload(); };
  const del = async (p: Product) => { if (confirm(`حذف "${p.name}"؟`)) { await deleteDoc(doc(dbI(), "products", p.id)); reload(); } };
  return (
    <>
      <div className="row wrap"><b className="sp" style={{ fontSize: 18 }}>منتجاتي ({data?.length ?? 0})</b><Link className="btn" href="/merchant/products/new">+ إضافة منتج</Link></div>
      {loading ? <div className="skel" /> : !data?.length ? <Empty icon="ph-package" title="لسه ماضفتش منتجات" sub="أضف أول منتج وابدأ استقبل الطلبات." /> : (
        <div className="col">
          {data.map((p) => (
            <div key={p.id} className="card row wrap">
              {p.images?.[0] ? <img className="ph-thumb" src={sized(p.images[0], 120)} alt="" loading="lazy" /> : <div className="ph-thumb" />}
              <div className="sp" style={{ minWidth: 160 }}><b>{p.name}</b><br /><small>{p.categoryName} · {rangeText(p)} ج.م / {p.unit}</small></div>
              <Status s={p.status} />
              <Link className="btn o sm2" href={`/merchant/products/${p.id}`}>تعديل</Link>
              {p.status !== "pending" && <button className="btn o sm2" onClick={() => toggle(p)}>{p.status === "hidden" ? "إظهار" : "إخفاء"}</button>}
              <button className="btn r sm2" onClick={() => del(p)}>حذف</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
