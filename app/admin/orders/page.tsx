"use client";
import { useState } from "react";
import { collection, doc, getDocs, limit, query, updateDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { ms } from "@/lib/format";
import { OrdersList } from "@/components/OrdersList";
import { ORDER_STATUS, STATUS_FLOW } from "@/lib/config";
import type { Order } from "@/lib/types";

export default function AdminOrders() {
  const { data, loading, reload } = useAsync(async () => {
    const s = await getDocs(query(collection(dbI(), "orders"), limit(500)));
    return s.docs.map((d) => withId<Order>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }, []);
  const [f, setF] = useState("all");
  const onStatus = async (o: Order, status: string, trackingNo?: string) => {
    await updateDoc(doc(dbI(), "orders", o.id), { status, ...(trackingNo !== undefined ? { trackingNo } : {}) });
    reload();
  };
  const list = (data ?? []).filter((o) => f === "all" || o.status === f);
  return (
    <>
      <b style={{ fontSize: 18 }}>الطلبات ({data?.length ?? 0})</b>
      <div className="row wrap"><button className={`chip ${f === "all" ? "on" : ""}`} onClick={() => setF("all")}>الكل</button>{STATUS_FLOW.map((s) => <button key={s} className={`chip ${f === s ? "on" : ""}`} onClick={() => setF(s)}>{ORDER_STATUS[s]}</button>)}</div>
      {loading ? <div className="skel" /> : <OrdersList orders={list} role="admin" onStatus={onStatus} />}
    </>
  );
}
