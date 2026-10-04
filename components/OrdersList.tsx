"use client";
import { useState } from "react";
import { ORDER_STATUS, PAY_METHODS, SHIP_METHODS, STATUS_FLOW } from "@/lib/config";
import { dateStr, fmt } from "@/lib/format";
import type { Order } from "@/lib/types";
import { Empty, Img, Status } from "./Ui";

type Props = { orders: Order[]; role: "buyer" | "merchant" | "admin"; onStatus?: (o: Order, s: string, tracking?: string) => void };

function Tracking({ o, onStatus }: { o: Order; onStatus: NonNullable<Props["onStatus"]> }) {
  const [t, setT] = useState(o.trackingNo || "");
  return <input className="in" style={{ maxWidth: 200 }} placeholder="رقم الشحنة (اختياري)" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => t !== (o.trackingNo || "") && onStatus(o, o.status, t)} />;
}

export function OrdersList({ orders, role, onStatus }: Props) {
  if (!orders.length) return <Empty icon="ph-receipt" title="مفيش طلبات لسه" />;
  return (
    <div className="col">
      {orders.map((o) => (
        <div key={o.id} className="card col">
          <div className="row wrap">
            <b className="sp">{o.orderNo}</b><small>{dateStr(o.createdAt)}</small><Status s={o.status} />
          </div>
          {role !== "buyer" && <div className="row wrap g8"><span><i className="ph ph-user" /> {o.buyerName}</span><a href={`tel:${o.phone}`} style={{ color: "var(--pm)", direction: "ltr" }}>{o.phone}</a>{role === "admin" && <span className="bd g">{o.merchantName}</span>}</div>}
          {role === "buyer" && <small>التاجر: {o.merchantName}</small>}
          {o.items.map((i) => (
            <div key={i.id} className="row">
              <Img src={i.image} ic="ph-package" ratio={1} style={{ width: 48, borderRadius: 8, flex: "none" }} />
              <div className="sp">{i.name}<br /><small>{i.qty} {i.unit} × {fmt(i.price)} ج.م</small></div>
              <b>{fmt(i.qty * i.price)} ج.م</b>
            </div>
          ))}
          <div className="grid" style={{ ["--m" as string]: 1, ["--d" as string]: 2 }}>
            <small><i className="ph ph-map-pin" /> {o.address.governorate}، {o.address.city}، {o.address.street}{o.address.landmark ? ` (${o.address.landmark})` : ""}</small>
            <small>{PAY_METHODS.find((p) => p.id === o.payment)?.label ?? o.payment} · {SHIP_METHODS.find((s) => s.id === o.shipping.method)?.label ?? ""}</small>
          </div>
          {o.note && <small>ملاحظة: {o.note}</small>}
          {o.trackingNo && role === "buyer" && <small>رقم الشحنة: <b>{o.trackingNo}</b></small>}
          <div className="row wrap">
            <span className="sp b">الإجمالي: {fmt(o.total)} ج.م <small>(شامل شحن {fmt(o.shipping.cost)})</small></span>
            {role === "buyer" && o.status === "new" && onStatus && <button className="btn r sm2" onClick={() => onStatus(o, "cancelled")}>إلغاء الطلب</button>}
            {role !== "buyer" && onStatus && (
              <>
                <Tracking o={o} onStatus={onStatus} />
                <select className="in" style={{ maxWidth: 170 }} value={o.status} onChange={(e) => onStatus(o, e.target.value)}>
                  {STATUS_FLOW.map((s) => <option key={s} value={s}>{ORDER_STATUS[s]}</option>)}
                </select>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
