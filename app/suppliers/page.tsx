"use client";
import Link from "next/link";
import { st } from "@/lib/style";
import { useAsync } from "@/lib/hooks";
import { listApprovedMerchants } from "@/lib/store";
import { Empty, Img, Loading } from "@/components/Ui";

export default function Suppliers() {
  const { data, loading } = useAsync(listApprovedMerchants);
  return (
    <div className="wc">
      <h1 style={{ marginBottom: 16 }}>التجار والمصانع</h1>
      {loading ? <Loading rows={2} /> : !data?.length ? <Empty icon="ph-storefront" title="لسه مفيش تجار منشورين"><Link href="/sell" className="btn">سجّل كتاجر</Link></Empty> : (
        <div className="grid" style={st("--m:1;--d:3")}>
          {data.map((m) => (
            <Link key={m.id} href={`/store/${m.id}`} className="card row">
              <Img ic="ph-storefront" ratio={1} style={{ width: 64, borderRadius: 8, flex: "none" }} />
              <div className="sp col g4"><b>{m.name}</b>
                <div className="row g4 wrap">{m.verified && <span className="bd v"><i className="ph ph-seal-check" />موثّق</span>}<span className="bd g">{m.type}</span></div>
                <small><i className="ph ph-map-pin" /> {m.governorate}</small></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
