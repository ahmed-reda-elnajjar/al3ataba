"use client";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { withId } from "@/lib/store";
import { ms } from "@/lib/format";
import { OrdersList } from "@/components/OrdersList";
import type { Order } from "@/lib/types";

export default function MerchantOrders() {
  const { user } = useApp();
  const { data, loading, reload } = useAsync(async () => {
    const s = await getDocs(query(collection(dbI(), "orders"), where("merchantId", "==", user?.uid ?? "")));
    return s.docs.map((d) => withId<Order>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }, [user?.uid]);
  const onStatus = async (o: Order, status: string, trackingNo?: string) => {
    await updateDoc(doc(dbI(), "orders", o.id), { status, ...(trackingNo !== undefined ? { trackingNo } : {}) });
    reload();
  };
  return (
    <>
      <b style={{ fontSize: 18 }}>طلبات العملاء ({data?.length ?? 0})</b>
      {loading ? <div className="skel" /> : <OrdersList orders={data ?? []} role="merchant" onStatus={onStatus} />}
    </>
  );
}
