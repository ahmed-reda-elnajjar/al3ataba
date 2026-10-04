"use client";
import { useState } from "react";
import { collection, doc, getDocs, limit, query, updateDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { ms, waLink } from "@/lib/format";
import { Empty, Status } from "@/components/Ui";
import type { Merchant } from "@/lib/types";

export default function AdminMerchants() {
  const { data, loading, reload } = useAsync(async () => {
    const s = await getDocs(query(collection(dbI(), "merchants"), limit(500)));
    return s.docs.map((d) => withId<Merchant>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }, []);
  const [f, setF] = useState("all");
  const patch = async (m: Merchant, v: Partial<Merchant>) => { await updateDoc(doc(dbI(), "merchants", m.id), v); reload(); };
  const list = (data ?? []).filter((m) => f === "all" || m.status === f);
  return (
    <>
      <b style={{ fontSize: 18 }}>التجار ({data?.length ?? 0})</b>
      <div className="row wrap">{[["all", "الكل"], ["pending", "منتظرين"], ["approved", "معتمدين"], ["rejected", "مرفوضين"]].map(([k, t]) => <button key={k} className={`chip ${f === k ? "on" : ""}`} onClick={() => setF(k)}>{t}</button>)}</div>
      {loading ? <div className="skel" /> : !list.length ? <Empty icon="ph-storefront" title="مفيش تجار" /> : (
        <div className="col">
          {list.map((m) => (
            <div key={m.id} className="card col">
              <div className="row wrap"><b className="sp">{m.name}</b>{m.verified && <span className="bd v"><i className="ph ph-seal-check" />موثّق</span>}<Status s={m.status} /></div>
              <small>{m.type} · {m.governorate}{m.city ? `، ${m.city}` : ""} · <a href={waLink(m.phone)} target="_blank" rel="noreferrer" style={{ color: "var(--pm)", direction: "ltr", display: "inline-block" }}>{m.phone}</a>{m.email ? ` · ${m.email}` : ""}</small>
              {(m.regNo || m.taxNo) && <small>سجل تجاري: {m.regNo || "—"} · بطاقة ضريبية: {m.taxNo || "—"}</small>}
              {m.about && <small>{m.about}</small>}
              <div className="row wrap">
                {m.status !== "approved" && <button className="btn sm2" onClick={() => patch(m, { status: "approved" })}>قبول</button>}
                {m.status !== "rejected" && <button className="btn r sm2" onClick={() => patch(m, { status: "rejected", verified: false })}>رفض</button>}
                {m.status === "approved" && <button className="btn o sm2" onClick={() => patch(m, { verified: !m.verified })}>{m.verified ? "إلغاء التوثيق" : "توثيق التاجر"}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
