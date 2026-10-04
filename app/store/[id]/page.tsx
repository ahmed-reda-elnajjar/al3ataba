"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { st } from "@/lib/style";
import { HOUSE } from "@/lib/config";
import { useAsync } from "@/lib/hooks";
import { getMerchant, listMerchantProducts } from "@/lib/store";
import { Empty, Img, Loading, ProductCard } from "@/components/Ui";

export default function Store() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useAsync(async () => {
    const [m, products] = await Promise.all([id === HOUSE.id ? null : getMerchant(id), listMerchantProducts(id)]);
    return { m, products };
  }, [id]);
  if (loading) return <div className="wc"><Loading rows={2} /></div>;
  const m = data?.m;
  if (id !== HOUSE.id && (!m || m.status !== "approved")) return <div className="wc"><Empty icon="ph-storefront" title="المتجر مش موجود"><Link href="/suppliers" className="btn">كل التجار</Link></Empty></div>;
  const name = m?.name || HOUSE.name;
  return (
    <div className="wc">
      <div className="card row wrap">
        <Img ic="ph-storefront" ratio={1} style={{ width: 84, borderRadius: 12, flex: "none" }} />
        <div className="sp col g4" style={{ minWidth: 220 }}>
          <h1 style={{ fontSize: 24 }}>{name}</h1>
          <div className="row g8 wrap">{m?.verified && <span className="bd v"><i className="ph ph-seal-check" />موثّق</span>}{m && <span className="bd g">{m.type}</span>}{m && <small>{m.governorate}{m.city ? `، ${m.city}` : ""}</small>}</div>
        </div>
      </div>
      {m?.about && <div className="card col mt"><h3>عن المتجر</h3><p style={{ whiteSpace: "pre-wrap" }}>{m.about}</p></div>}
      <div className="sec mt2"><h2>المنتجات ({data?.products.length ?? 0})</h2>
        {data?.products.length ? <div className="grid" style={st("--m:2;--d:4")}>{data.products.map((p) => <ProductCard key={p.id} p={p} verified={m?.verified} />)}</div> : <Empty icon="ph-package" title="مفيش منتجات منشورة لسه" />}
      </div>
    </div>
  );
}
