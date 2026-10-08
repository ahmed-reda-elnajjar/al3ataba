"use client";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { st } from "@/lib/style";
import { HOUSE } from "@/lib/config";
import { useAsync } from "@/lib/hooks";
import { waLink, dateStr } from "@/lib/format";
import { getMerchant, listMerchantProducts } from "@/lib/store";
import { Empty, Loading, ProductCard } from "@/components/Ui";
import { Skyline } from "@/components/Brand";

export default function Store() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"products" | "info">("products");
  const [cat, setCat] = useState("");
  const { data, loading } = useAsync(async () => {
    const [m, products] = await Promise.all([id === HOUSE.id ? null : getMerchant(id), listMerchantProducts(id)]);
    return { m, products };
  }, [id]);
  if (loading) return <div className="wc"><Loading rows={2} /></div>;
  const m = data?.m;
  if (id !== HOUSE.id && (!m || m.status !== "approved")) return <div className="wc"><Empty icon="ph-storefront" title="المتجر مش موجود"><Link href="/suppliers" className="btn">كل التجار</Link></Empty></div>;
  const name = m?.name || HOUSE.name;
  const products = data?.products ?? [];
  const cats = Array.from(new Map(products.map((p) => [p.categoryId, p.categoryName])).entries());
  const shown = products.filter((p) => !cat || p.categoryId === cat);
  return (
    <div className="wc">
      <div className="sthead">
        <div className="cv"><Skyline className="" /></div>
        <div className="in">
          <span className="av"><i className="ph ph-storefront" /></span>
          <div className="sp col g4" style={{ minWidth: 180 }}>
            <h1 style={{ fontSize: 21 }}>{name}</h1>
            <div className="row g8 wrap">
              {m?.verified && <span className="bd v"><i className="ph ph-seal-check" />موثّق</span>}
              {m && <span className="bd g">{m.type}</span>}
              <small>{m ? `${m.governorate}${m.city ? `، ${m.city}` : ""}` : "متجر العتبة الرسمي"}</small>
            </div>
          </div>
          {m?.phone && <a className="btn sm2" href={waLink(m.phone, `مرحباً، شفت متجركم على العتبة أونلاين`)} target="_blank" rel="noreferrer"><i className="ph ph-whatsapp-logo" />تواصل</a>}
        </div>
      </div>
      <div className="tabs mt">
        <button className={tab === "products" ? "on" : ""} onClick={() => setTab("products")}>المنتجات ({products.length})</button>
        <button className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>معلومات المتجر</button>
      </div>
      {tab === "products" ? (
        <div className="mt">
          {cats.length > 1 && (
            <div className="scr" style={{ marginBottom: 12 }}>
              <button className={`chip${!cat ? " on" : ""}`} onClick={() => setCat("")}>الكل</button>
              {cats.map(([cid, cn]) => <button key={cid} className={`chip${cat === cid ? " on" : ""}`} onClick={() => setCat(cid)}>{cn}</button>)}
            </div>
          )}
          {shown.length ? <div className="grid" style={st("--m:2;--d:4")}>{shown.map((p) => <ProductCard key={p.id} p={p} verified={m?.verified} />)}</div> : <Empty icon="ph-package" title="مفيش منتجات منشورة لسه" />}
        </div>
      ) : (
        <div className="menu mt">
          <div className="row" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}><span className="mi"><i className="ph ph-info" /></span><div className="sp"><b>عن المتجر</b><p className="mu" style={{ whiteSpace: "pre-wrap" }}>{m?.about || "متجر العتبة أونلاين."}</p></div></div>
          {m && <div className="row" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}><span className="mi"><i className="ph ph-map-pin" /></span><div className="sp"><b>العنوان</b><p className="mu">{m.governorate}{m.city ? `، ${m.city}` : ""}</p></div></div>}
          {m && <div className="row" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}><span className="mi"><i className="ph ph-factory" /></span><div className="sp"><b>النشاط</b><p className="mu">{m.type}</p></div></div>}
          {m?.createdAt && <div className="row" style={{ padding: 16 }}><span className="mi"><i className="ph ph-calendar" /></span><div className="sp"><b>على العتبة من</b><p className="mu">{dateStr(m.createdAt)}</p></div></div>}
        </div>
      )}
    </div>
  );
}
