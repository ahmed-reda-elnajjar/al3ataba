"use client";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { priceFor } from "@/lib/pricing";
import { useApp } from "@/lib/providers";
import { Empty, Img } from "@/components/Ui";

export default function Cart() {
  const { items, remove, add, settings } = useApp();
  const groups = Object.entries(items.reduce<Record<string, typeof items>>((m, i) => { (m[i.merchantId] ||= []).push(i); return m; }, {}));
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const shipping = groups.length * settings.shippingPerMerchant;
  if (!items.length) {
    return <div className="wc"><Empty icon="ph-shopping-cart" title="السلة فاضية"><Link href="/search" className="btn">تصفّح المنتجات</Link></Empty></div>;
  }
  const change = (id: string, q: number) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const qty = Math.max(it.moq, q);
    add({ ...it, qty, price: it.tiers ? priceFor(it.tiers, qty) : it.price });
  };
  return (
    <div className="wc">
      <h1 style={{ marginBottom: 4 }}>سلة التسوق</h1><small style={{ display: "block", marginBottom: 14 }}>{items.length} منتجات</small>
      <div className="row wrap" style={{ alignItems: "flex-start", gap: 24 }}>
        <div className="sp col" style={{ minWidth: 280 }}>
          {groups.map(([mid, list]) => (
            <div key={mid} className="card col">
              <div className="row"><b className="sp">{list[0].merchant}</b><span className="bd g">طلب منفصل</span></div>
              {list.map((i) => (
                <div key={i.id} className="row">
                  <Img src={i.image} ic="ph-package" ratio={1} w={160} style={{ width: 72, borderRadius: 12, flex: "none", background: "#fff", border: "1px solid var(--bd)" }} />
                  <div className="sp col g4">
                    <b>{i.name}</b>
                    <small>{fmt(i.price)} ج.م / {i.unit}</small>
                    {i.fixed ? <small>الكمية: {i.qty} {i.unit} (حسب عرض السعر)</small> : (
                      <div className="qty" style={{ alignSelf: "flex-start" }}><button style={{ height: 34, width: 34 }} aria-label="أكثر" onClick={() => change(i.id, i.qty + Math.max(1, Math.round(i.moq / 2)))}><i className="ph ph-plus" /></button><b style={{ minWidth: 44, textAlign: "center" }}>{i.qty}</b><button style={{ height: 34, width: 34 }} aria-label="أقل" onClick={() => change(i.id, i.qty - Math.max(1, Math.round(i.moq / 2)))}><i className="ph ph-minus" /></button></div>
                    )}
                  </div>
                  <div className="col g8" style={{ alignItems: "flex-end" }}>
                    <button className="ico" onClick={() => remove(i.id)} aria-label="حذف" style={{ color: "var(--err)" }}><i className="ph ph-trash" /></button>
                    <b className="price">{fmt(i.qty * i.price)} ج.م</b>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="card col" style={{ width: 330, maxWidth: "100%", flex: "none" }}>
          <h3>ملخص الطلب</h3>
          <div className="row"><span className="sp">المنتجات</span>{fmt(subtotal)} ج.م</div>
          <div className="row"><span className="sp">الشحن ({groups.length} تاجر)</span>{fmt(shipping)} ج.م</div>
          <div className="row b"><span className="sp">الإجمالي</span><span style={{ fontSize: 20 }}>{fmt(subtotal + shipping)} ج.م</span></div>
          <Link href="/checkout" className="btn blk">إتمام الطلب</Link>
          <small>الشحن تقديري وممكن يتعدّل حسب الكمية والمحافظة.</small>
        </div>
      </div>
    </div>
  );
}
