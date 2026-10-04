"use client";
import { collection, doc, getDocs, limit, query, updateDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { dateStr, ms } from "@/lib/format";
import { Empty, Status } from "@/components/Ui";
import type { Rfq } from "@/lib/types";

export default function AdminRfqs() {
  const { data, loading, reload } = useAsync(async () => {
    const s = await getDocs(query(collection(dbI(), "rfqs"), limit(300)));
    return s.docs.map((d) => withId<Rfq>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }, []);
  const toggle = async (r: Rfq) => { await updateDoc(doc(dbI(), "rfqs", r.id), { status: r.status === "open" ? "closed" : "open" }); reload(); };
  return (
    <>
      <b style={{ fontSize: 18 }}>طلبات عروض الأسعار ({data?.length ?? 0})</b>
      {loading ? <div className="skel" /> : !data?.length ? <Empty icon="ph-clipboard-text" title="مفيش طلبات" /> : (
        <div className="col">
          {data.map((r) => (
            <div key={r.id} className="card col">
              <div className="row wrap"><b className="sp">{r.product}</b><small>{dateStr(r.createdAt)}</small><Status s={r.status} /></div>
              <small>{r.buyerName} · {r.quantity} {r.unit} · {r.governorate} · ميزانية: {r.budget || "—"} · مطلوب قبل: {r.neededBy || "—"}</small>
              {r.specs && <small>{r.specs}</small>}
              <button className="btn o sm2" style={{ alignSelf: "flex-start" }} onClick={() => toggle(r)}>{r.status === "open" ? "إغلاق الطلب" : "إعادة فتحه"}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
