"use client";
/* Admin: selling on commission — reseller orders (confirm → ship → delivered/returned), resellers, withdrawals, settings. */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { arrayUnion, collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useAsync } from "@/lib/hooks";
import { listCategories, withId } from "@/lib/store";
import { GOVERNORATES } from "@/lib/config";
import { fmt, dateStr, ms } from "@/lib/format";
import { st } from "@/lib/style";
import { treeList } from "@/lib/cats";
import { touchCatalog } from "@/lib/catalogClient";
import { Empty } from "@/components/Ui";
import { PAYOUT_METHODS, RSTATUS, resellSettings, wallet, type Payout, type ROrder, type RStatus, type Reseller, type ResellSettings } from "@/lib/resell";

const ji = (n: number) => `${fmt(n)} ج.م`;
const NEXT: Record<RStatus, RStatus[]> = { new: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered", "returned"], delivered: ["returned"], returned: [], cancelled: ["new"] };

function Body() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") || "orders";
  const go = (t: string) => router.replace(`/admin/resell?tab=${t}`);
  const { data, loading, reload } = useAsync(async () => {
    const [o, r, p] = await Promise.all([
      getDocs(query(collection(dbI(), "rorders"), orderBy("createdAt", "desc"), limit(500))),
      getDocs(collection(dbI(), "resellers")),
      getDocs(collection(dbI(), "payouts")),
    ]);
    return {
      orders: o.docs.map((d) => withId<ROrder>(d)),
      resellers: r.docs.map((d) => withId<Reseller>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
      payouts: p.docs.map((d) => withId<Payout>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
    };
  }, []);
  const pendingR = data?.resellers.filter((r) => r.status === "pending").length ?? 0;
  const newO = data?.orders.filter((o) => o.status === "new").length ?? 0;
  const reqP = data?.payouts.filter((p) => p.status === "requested").length ?? 0;
  return (
    <div className="col" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 20 }}>البيع بالعمولة</h2>
      <div className="seg">
        {[["orders", `الطلبات${newO ? ` (${newO})` : ""}`], ["resellers", `البائعين${pendingR ? ` (${pendingR})` : ""}`], ["payouts", `السحب${reqP ? ` (${reqP})` : ""}`], ["settings", "الإعدادات"]].map(([k, t]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{t}</button>)}
      </div>
      {loading || !data ? <div className="skel" /> : (
        <>
          {tab === "orders" && <Orders orders={data.orders} reload={reload} />}
          {tab === "resellers" && <Resellers list={data.resellers} orders={data.orders} payouts={data.payouts} reload={reload} />}
          {tab === "payouts" && <Payouts list={data.payouts} reload={reload} />}
          {tab === "settings" && <Settings />}
        </>
      )}
    </div>
  );
}

function Orders({ orders, reload }: { orders: ROrder[]; reload: () => void }) {
  const [f, setF] = useState<string>("new"); const [busy, setBusy] = useState("");
  const list = orders.filter((o) => !f || o.status === f);
  const move = async (o: ROrder, s: RStatus) => {
    if ((s === "cancelled" || s === "returned") && !confirm(`تأكيد: الطلب هيتعلّم "${RSTATUS[s]}"؟`)) return;
    setBusy(o.id);
    try {
      await updateDoc(doc(dbI(), "rorders", o.id), { status: s, history: arrayUnion({ status: s, at: Date.now() }), deliveredAt: s === "delivered" ? Date.now() : null });
      reload();
    } catch { alert("مقدرتش أحفظ — اتأكد إن قواعد Firebase اتحدّثت"); }
    setBusy("");
  };
  const wa = (p: string) => `https://wa.me/2${p}`;
  return (
    <>
      <div className="scr">
        <button className={`chip${!f ? " on" : ""}`} onClick={() => setF("")}>الكل ({orders.length})</button>
        {(Object.keys(RSTATUS) as RStatus[]).map((s) => <button key={s} className={`chip${f === s ? " on" : ""}`} onClick={() => setF(s)}>{RSTATUS[s]} ({orders.filter((o) => o.status === s).length})</button>)}
      </div>
      {!list.length ? <Empty icon="ph-receipt" title="مفيش طلبات هنا" /> : list.map((o) => (
        <div key={o.id} className="card col" style={{ gap: 8 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <b className="sp">{o.customer.name} — {o.customer.governorate}</b>
            <span className="bd">{RSTATUS[o.status]}</span>
            <small className="mu">{dateStr(o.createdAt)} · #{o.id.slice(0, 6)}</small>
          </div>
          <div className="row wrap" style={{ gap: 10, fontSize: 13.5 }}>
            <a href={`tel:${o.customer.phone}`} className="btn o sm2"><i className="ph ph-phone" />{o.customer.phone}</a>
            <a href={wa(o.customer.phone)} target="_blank" rel="noreferrer" className="btn o sm2"><i className="ph ph-whatsapp-logo" />واتساب</a>
            {o.customer.phone2 && <a href={`tel:${o.customer.phone2}`} className="btn o sm2">{o.customer.phone2}</a>}
          </div>
          <small>{o.customer.address}{o.customer.notes ? ` — ملاحظات: ${o.customer.notes}` : ""}</small>
          <table className="tbl"><tbody>{o.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td>{i.qty} {i.unit}</td><td>{ji(i.base)} + {ji(i.commission)}</td><td><b>{ji(i.price * i.qty)}</b></td></tr>)}</tbody></table>
          <div className="row wrap" style={{ gap: 14, fontSize: 13.5 }}>
            <span>يحصّل من العميل: <b>{ji(o.total)}</b> (شحن {ji(o.shipping)})</span>
            <span>عمولة البائع: <b>{ji(o.commissionTotal)}</b></span>
            <span className="mu">البائع: {o.resellerName}</span>
          </div>
          {NEXT[o.status].length > 0 && (
            <div className="row wrap" style={{ gap: 8 }}>
              {NEXT[o.status].map((s) => <button key={s} className={`btn sm2${s === "cancelled" || s === "returned" ? " r" : ""}`} disabled={busy === o.id} onClick={() => move(o, s)}>{s === "new" ? "رجّعه جديد" : `علّمه: ${RSTATUS[s]}`}</button>)}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Resellers({ list, orders, payouts, reload }: { list: Reseller[]; orders: ROrder[]; payouts: Payout[]; reload: () => void }) {
  const set = async (r: Reseller, status: Reseller["status"]) => { await updateDoc(doc(dbI(), "resellers", r.id), { status }); reload(); };
  if (!list.length) return <Empty icon="ph-users" title="مفيش بائعين لسه" sub="أول ما حد يقدّم من صفحة البيع بالعمولة هيظهر هنا." />;
  return (
    <>
      {list.map((r) => {
        const mine = orders.filter((o) => o.resellerId === r.id), w = wallet(mine, payouts.filter((p) => p.resellerId === r.id));
        const done = mine.filter((o) => o.status === "delivered").length, back = mine.filter((o) => o.status === "returned").length;
        return (
          <div key={r.id} className="card col" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 8 }}><b className="sp">{r.name}</b><span className="bd">{r.status === "approved" ? "مفعّل" : r.status === "pending" ? "مستني الموافقة" : "موقوف"}</span></div>
            <small>{r.phone} · {r.governorate} · {PAYOUT_METHODS[r.payMethod]}: {r.payNumber}</small>
            <small className="mu">طلبات: {mine.length} · اتسلّم {done} · مرتجع {back} · متاح للسحب {ji(w.available)} · اتحوّله {ji(w.paid)}</small>
            <div className="row wrap" style={{ gap: 8 }}>
              {r.status !== "approved" && <button className="btn sm2" onClick={() => set(r, "approved")}><i className="ph ph-check" />فعّل الحساب</button>}
              {r.status === "approved" && <button className="btn r sm2" onClick={() => confirm(`إيقاف ${r.name}؟`) && set(r, "suspended")}>إيقاف</button>}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Payouts({ list, reload }: { list: Payout[]; reload: () => void }) {
  const set = async (p: Payout, status: Payout["status"]) => {
    const note = status === "rejected" ? prompt("سبب الرفض (بيظهر للبائع):") ?? "" : "";
    await updateDoc(doc(dbI(), "payouts", p.id), { status, paidAt: status === "paid" ? Date.now() : null, ...(note ? { note } : {}) }); reload();
  };
  if (!list.length) return <Empty icon="ph-wallet" title="مفيش طلبات سحب" />;
  return (
    <>
      {list.map((p) => (
        <div key={p.id} className="card row wrap" style={{ gap: 10 }}>
          <div className="sp col" style={{ gap: 2 }}>
            <b>{ji(p.amount)} — {p.resellerName}</b>
            <small>{PAYOUT_METHODS[p.method as "vcash"] || p.method}: <b>{p.number}</b> · {dateStr(p.createdAt)}</small>
          </div>
          {p.status === "requested" ? (
            <>
              <button className="btn sm2" onClick={() => confirm(`حوّلت ${p.amount} ج.م على ${p.number}؟`) && set(p, "paid")}><i className="ph ph-check" />اتحوّل</button>
              <button className="btn r sm2" onClick={() => set(p, "rejected")}>رفض</button>
            </>
          ) : <span className="bd">{p.status === "paid" ? "اتحوّل" : "مرفوض"}</span>}
        </div>
      ))}
    </>
  );
}

function Settings() {
  // read the saved values straight from Firebase so we never overwrite them with defaults
  const saved = useAsync(async () => { const s = await getDoc(doc(dbI(), "settings", "site")); return resellSettings((s.data() as { resell?: ResellSettings } | undefined)?.resell); }, []);
  if (!saved.data) return <div className="skel" />;
  return <SettingsForm initial={saved.data} />;
}
function SettingsForm({ initial }: { initial: ResellSettings }) {
  const cats = useAsync(listCategories, []);
  const [rs, setRs] = useState<ResellSettings>(initial);
  const [msg, setMsg] = useState("");
  const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0));
  const save = async () => {
    const clean = (o?: Record<string, number | undefined>) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === "number")) as Record<string, number>;
    try {
      await setDoc(doc(dbI(), "settings", "site"), { resell: { ...rs, catCommission: clean(rs.catCommission), ship: clean(rs.ship) } }, { merge: true });
      touchCatalog(); setMsg("اتحفظ ✓ (البائعين هيشوفوا الأرقام الجديدة خلال دقايق)");
    } catch { setMsg("مقدرتش أحفظ"); }
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card col" style={{ gap: 10 }}>
        <b>الأساسيات</b>
        <div className="grid" style={st("--m:1;--d:3")}>
          <div className="fld"><label>العمولة الافتراضية لكل قطعة (ج.م)</label><input className="in" inputMode="numeric" value={rs.commission} onChange={(e) => setRs({ ...rs, commission: num(e.target.value) ?? 0 })} /></div>
          <div className="fld"><label>شحن افتراضي على العميل (ج.م)</label><input className="in" inputMode="numeric" value={rs.shipDefault} onChange={(e) => setRs({ ...rs, shipDefault: num(e.target.value) ?? 0 })} /></div>
          <div className="fld"><label>أيام قبل ما العمولة تبقى متاحة</label><input className="in" inputMode="numeric" value={rs.holdDays ?? 3} onChange={(e) => setRs({ ...rs, holdDays: num(e.target.value) ?? 0 })} /></div>
        </div>
        <small className="mu">العمولة الافتراضية بتتحدد بالترتيب: المنتج نفسه (من صفحة تعديل المنتج) ← القسم ← القسم الرئيسي ← الرقم ده. البائع يقدر يغيّرها في كل طلب.</small>
      </div>
      <div className="card col" style={{ gap: 8 }}>
        <b>عمولة لكل قسم <small>(فاضي = الافتراضي)</small></b>
        <div className="grid" style={st("--m:1;--d:3")}>
          {treeList(cats.data ?? []).map((c) => (
            <div key={c.id} className="row" style={{ gap: 8 }}>
              <span className="sp" style={{ fontSize: 13.5, fontWeight: c.depth ? 400 : 700 }}>{c.depth ? "— " : ""}{c.name}</span>
              <input className="in" style={{ width: 90 }} inputMode="numeric" placeholder={String(rs.commission)} value={rs.catCommission?.[c.id] ?? ""} onChange={(e) => setRs({ ...rs, catCommission: { ...(rs.catCommission || {}), [c.id]: num(e.target.value) as number } })} />
            </div>
          ))}
        </div>
      </div>
      <div className="card col" style={{ gap: 8 }}>
        <b>الشحن لكل محافظة <small>(فاضي = الافتراضي {rs.shipDefault} ج.م)</small></b>
        <div className="grid" style={st("--m:2;--d:4")}>
          {GOVERNORATES.map((g) => (
            <div key={g} className="row" style={{ gap: 6 }}>
              <span className="sp" style={{ fontSize: 13.5 }}>{g}</span>
              <input className="in" style={{ width: 80 }} inputMode="numeric" placeholder={String(rs.shipDefault)} value={rs.ship?.[g] ?? ""} onChange={(e) => setRs({ ...rs, ship: { ...(rs.ship || {}), [g]: num(e.target.value) as number } })} />
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 10 }}><button className="btn" onClick={save}>حفظ الإعدادات</button>{msg && <span className="ok">{msg}</span>}</div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="skel" />}><Body /></Suspense>;
}
