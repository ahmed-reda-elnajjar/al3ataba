"use client";
/* Admin: selling on commission — reseller orders (confirm → ship → delivered/returned), resellers, withdrawals, settings.
 * Everything goes through /api/resell/admin (service account), so it doesn't depend on the browser's Firestore rules. */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { listCategories } from "@/lib/store";
import { GOVERNORATES } from "@/lib/config";
import { fmt, dateStr } from "@/lib/format";
import { st } from "@/lib/style";
import { treeList } from "@/lib/cats";
import { Empty } from "@/components/Ui";
import { PAYOUT_METHODS, RNEXT, RSTATUS, wallet, type Payout, type ROrder, type RStatus, type Reseller, type ResellSettings } from "@/lib/resell";

const ji = (n: number) => `${fmt(n)} ج.م`;
type Data = { orders: ROrder[]; resellers: Reseller[]; payouts: Payout[]; settings: ResellSettings };

async function api<T>(user: User, body?: unknown): Promise<T> {
  const r = await fetch("/api/resell/admin", { method: body ? "POST" : "GET", cache: "no-store", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `حصلت مشكلة (${r.status})`);
  return j as T;
}

function Body() {
  const { user } = useApp();
  const router = useRouter();
  const tab = useSearchParams().get("tab") || "orders";
  const go = (t: string) => router.replace(`/admin/resell?tab=${t}`);
  const { data, loading, error, reload } = useAsync(async () => (user ? api<Data>(user) : null), [user?.uid]);
  const act = async (body: object) => { if (!user) return false; try { await api(user, body); reload(); return true; } catch (e) { alert(String((e as Error).message)); return false; } };
  const pendingR = data?.resellers.filter((r) => r.status === "pending").length ?? 0;
  const newO = data?.orders.filter((o) => o.status === "new").length ?? 0;
  const reqP = data?.payouts.filter((p) => p.status === "requested").length ?? 0;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row"><h2 className="sp" style={{ fontSize: 20 }}>البيع بالعمولة</h2><button className="btn o sm2" onClick={reload}><i className="ph ph-arrows-clockwise" />تحديث</button></div>
      <div className="seg" style={{ overflowX: "auto" }}>
        {[["orders", `الطلبات${newO ? ` (${newO} جديد)` : ""}`], ["resellers", `البائعين${pendingR ? ` (${pendingR})` : ""}`], ["payouts", `السحب${reqP ? ` (${reqP})` : ""}`], ["settings", "الإعدادات"]].map(([k, t]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{t}</button>)}
      </div>
      {error ? <Empty icon="ph-warning" title="مقدرتش أحمّل البيانات" sub={error}><button className="btn" onClick={reload}>جرّب تاني</button></Empty>
        : loading || !data ? <div className="skel" /> : (
          <>
            {tab === "orders" && <Orders orders={data.orders} act={act} />}
            {tab === "resellers" && <Resellers list={data.resellers} orders={data.orders} payouts={data.payouts} holdDays={data.settings.holdDays ?? 3} act={act} />}
            {tab === "payouts" && <Payouts list={data.payouts} act={act} />}
            {tab === "settings" && <SettingsForm initial={data.settings} act={act} />}
          </>
        )}
    </div>
  );
}

function Orders({ orders, act }: { orders: ROrder[]; act: (b: object) => Promise<boolean> }) {
  const [f, setF] = useState<string>("new"); const [busy, setBusy] = useState(""); const [q, setQ] = useState("");
  const t = q.trim();
  const list = orders.filter((o) => (!f || o.status === f) && (!t || `${o.customer.name} ${o.customer.phone} ${o.resellerName} ${o.id}`.includes(t)));
  const move = async (o: ROrder, s: RStatus) => {
    if ((s === "cancelled" || s === "returned") && !confirm(`تأكيد: الطلب هيتعلّم "${RSTATUS[s]}"؟`)) return;
    setBusy(o.id); await act({ action: "order", id: o.id, status: s }); setBusy("");
  };
  /** CSV for the shipping company's bulk upload (opens in Excel with Arabic). */
  const exportCsv = () => {
    const rows = list.length ? list : orders;
    const head = ["رقم الطلب", "اسم المستلم", "التليفون", "تليفون 2", "المحافظة", "المنطقة", "الشارع", "رقم العمارة", "الدور", "الشقة", "علامة مميزة", "الرقم البريدي", "العنوان كامل", "مبلغ التحصيل", "عدد القطع", "وصف الشحنة", "السماح بفتح الشحنة", "ملاحظات", "البائع"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    const lines = rows.map((o) => { const c = o.customer; return [o.id.slice(0, 8), c.name, c.phone, c.phone2 || "", c.governorate, c.area || "", c.street || "", c.building || "", c.floor || "", c.apartment || "", c.landmark || "", c.postal || "", c.address, o.total, o.items.reduce((a, i) => a + i.qty, 0), o.items.map((i) => `${i.name} × ${i.qty}`).join(" + "), c.allowOpen === false ? "لا" : "نعم", c.notes || "", o.resellerName].map(esc).join(","); });
    const blob = new Blob(["\ufeff" + [head.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `shipping-${f || "all"}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="row wrap" style={{ gap: 8 }}>
        <input className="in sp" style={{ minWidth: 220 }} placeholder="بحث بالاسم أو التليفون أو البائع أو رقم الطلب" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn o sm2" onClick={exportCsv} disabled={!orders.length}><i className="ph ph-file-csv" />تصدير لشركة الشحن ({list.length || orders.length})</button>
      </div>
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
          <div className="row wrap" style={{ gap: 8 }}>
            <a href={`tel:${o.customer.phone}`} className="btn o sm2"><i className="ph ph-phone" />{o.customer.phone}</a>
            <a href={`https://wa.me/2${o.customer.phone}`} target="_blank" rel="noreferrer" className="btn o sm2"><i className="ph ph-whatsapp-logo" />واتساب</a>
            {o.customer.phone2 && <a href={`tel:${o.customer.phone2}`} className="btn o sm2"><i className="ph ph-phone" />{o.customer.phone2}</a>}
          </div>
          <small>{o.customer.address}{o.customer.postal ? ` · ر.ب ${o.customer.postal}` : ""} · {o.customer.allowOpen === false ? "ممنوع فتح الشحنة" : "مسموح بفتح الشحنة"}{o.customer.notes ? ` — ملاحظات: ${o.customer.notes}` : ""}</small>
          <table className="tbl"><tbody>{o.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td>{i.qty} {i.unit}{i.retail ? " (قطاعي)" : ""}</td><td>{ji(i.base)} + {ji(i.commission)}</td><td><b>{ji(i.price * i.qty)}</b></td></tr>)}</tbody></table>
          <div className="row wrap" style={{ gap: 14, fontSize: 13.5 }}>
            <span>يتحصّل من العميل: <b>{ji(o.total)}</b> (منها شحن {ji(o.shipping)})</span>
            <span>عمولة البائع: <b>{ji(o.commissionTotal)}</b></span>
            <span>صافي لينا: <b>{ji(o.subtotal - o.commissionTotal)}</b></span>
            <span className="mu">البائع: {o.resellerName}{o.resellerPhone ? ` (${o.resellerPhone})` : ""}</span>
          </div>
          {RNEXT[o.status].length > 0 && (
            <div className="row wrap" style={{ gap: 8 }}>
              {RNEXT[o.status].map((s) => <button key={s} className={`btn sm2${s === "cancelled" || s === "returned" ? " r" : ""}`} disabled={busy === o.id} onClick={() => move(o, s)}>{s === "new" ? "رجّعه جديد" : `علّمه: ${RSTATUS[s]}`}</button>)}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Resellers({ list, orders, payouts, holdDays, act }: { list: Reseller[]; orders: ROrder[]; payouts: Payout[]; holdDays: number; act: (b: object) => Promise<boolean> }) {
  const [f, setF] = useState("");
  if (!list.length) return <Empty icon="ph-users" title="مفيش بائعين لسه" sub="أول ما حد يقدّم من صفحة البيع بالعمولة هيظهر هنا." />;
  const shown = list.filter((r) => !f || r.status === f);
  return (
    <>
      <div className="scr">
        {[["", "الكل"], ["pending", "مستني الموافقة"], ["approved", "مفعّل"], ["suspended", "موقوف"]].map(([k, t]) => <button key={k} className={`chip${f === k ? " on" : ""}`} onClick={() => setF(k)}>{t} ({k ? list.filter((r) => r.status === k).length : list.length})</button>)}
      </div>
      {shown.map((r) => {
        const mine = orders.filter((o) => o.resellerId === r.id), w = wallet(mine, payouts.filter((p) => p.resellerId === r.id), holdDays);
        const done = mine.filter((o) => o.status === "delivered").length, back = mine.filter((o) => o.status === "returned").length;
        const rate = done + back ? Math.round((done / (done + back)) * 100) : 0;
        return (
          <div key={r.id} className="card col" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 8 }}><b className="sp">{r.name}</b><span className="bd">{r.status === "approved" ? "مفعّل" : r.status === "pending" ? "مستني الموافقة" : "موقوف"}</span></div>
            <small>{r.phone} · {r.governorate} · {PAYOUT_METHODS[r.payMethod] || r.payMethod}: {r.payNumber}</small>
            <small className="mu">طلبات: {mine.length} · اتسلّم {done} · مرتجع {back}{done + back ? ` · نسبة التسليم ${rate}%` : ""} · متاح للسحب {ji(w.available)} · معلّق {ji(w.pending)} · اتحوّله {ji(w.paid)}</small>
            <div className="row wrap" style={{ gap: 8 }}>
              {r.status !== "approved" && <button className="btn sm2" onClick={() => act({ action: "reseller", id: r.id, status: "approved" })}><i className="ph ph-check" />فعّل الحساب</button>}
              {r.status === "approved" && <button className="btn r sm2" onClick={() => confirm(`إيقاف ${r.name}؟`) && act({ action: "reseller", id: r.id, status: "suspended" })}>إيقاف</button>}
              <a className="btn o sm2" href={`https://wa.me/2${r.phone}`} target="_blank" rel="noreferrer"><i className="ph ph-whatsapp-logo" />واتساب</a>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Payouts({ list, act }: { list: Payout[]; act: (b: object) => Promise<boolean> }) {
  if (!list.length) return <Empty icon="ph-wallet" title="مفيش طلبات سحب" />;
  const open = list.filter((p) => p.status === "requested").reduce((a, p) => a + p.amount, 0);
  return (
    <>
      {open > 0 && <div className="alert">محتاج تحوّل {ji(open)} للبائعين.</div>}
      {list.map((p) => (
        <div key={p.id} className="card row wrap" style={{ gap: 10 }}>
          <div className="sp col" style={{ gap: 2 }}>
            <b>{ji(p.amount)} — {p.resellerName}</b>
            <small>{PAYOUT_METHODS[p.method as "vcash"] || p.method}: <b>{p.number}</b> · {dateStr(p.createdAt)}{p.note ? ` · ${p.note}` : ""}</small>
          </div>
          {p.status === "requested" ? (
            <>
              <button className="btn sm2" onClick={() => confirm(`حوّلت ${p.amount} ج.م على ${p.number}؟`) && act({ action: "payout", id: p.id, status: "paid" })}><i className="ph ph-check" />اتحوّل</button>
              <button className="btn r sm2" onClick={() => { const note = prompt("سبب الرفض (بيظهر للبائع):"); if (note !== null) act({ action: "payout", id: p.id, status: "rejected", note }); }}>رفض</button>
            </>
          ) : <span className="bd">{p.status === "paid" ? "اتحوّل" : "مرفوض"}</span>}
        </div>
      ))}
    </>
  );
}

function SettingsForm({ initial, act }: { initial: ResellSettings; act: (b: object) => Promise<boolean> }) {
  const cats = useAsync(listCategories, []);
  const [rs, setRs] = useState<ResellSettings>(initial);
  const [msg, setMsg] = useState("");
  const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0));
  const save = async () => { setMsg(""); if (await act({ action: "settings", resell: rs })) setMsg("اتحفظ ✓ البائعين هيشوفوا الأرقام الجديدة على طول"); };
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card col" style={{ gap: 10 }}>
        <b>الأساسيات</b>
        <div className="grid" style={st("--m:1;--d:4")}>
          <div className="fld"><label>زيادة سعر القطاعي على الجملة %</label><input className="in" inputMode="numeric" value={rs.retailPct} onChange={(e) => setRs({ ...rs, retailPct: num(e.target.value) ?? 0 })} /></div>
          <div className="fld"><label>العمولة المقترحة % من سعرنا</label><input className="in" inputMode="numeric" value={rs.commissionPct} onChange={(e) => setRs({ ...rs, commissionPct: num(e.target.value) ?? 0 })} /></div>
          <div className="fld"><label>شحن افتراضي على العميل (ج.م)</label><input className="in" inputMode="numeric" value={rs.shipDefault} onChange={(e) => setRs({ ...rs, shipDefault: num(e.target.value) ?? 0 })} /></div>
          <div className="fld"><label>أيام قبل ما العمولة تبقى متاحة</label><input className="in" inputMode="numeric" value={rs.holdDays ?? 3} onChange={(e) => setRs({ ...rs, holdDays: num(e.target.value) ?? 0 })} /></div>
        </div>
        <small className="mu">مثال: منتج سعر جملته 100 ج ← القطاعي للبائع {Math.ceil(100 * (100 + rs.retailPct) / 100)} ج، والعمولة المقترحة {Math.round(Math.ceil(100 * (100 + rs.retailPct) / 100) * rs.commissionPct / 100)} ج، فيبيعه للعميل بـ {Math.ceil(100 * (100 + rs.retailPct) / 100) + Math.round(Math.ceil(100 * (100 + rs.retailPct) / 100) * rs.commissionPct / 100)} ج + الشحن.</small>
        <small className="mu">العمولة المقترحة بتتحدد بالترتيب: مبلغ ثابت على المنتج (من صفحة تعديل المنتج) ← مبلغ ثابت على القسم (تحت) ← النسبة دي. البائع يقدر يغيّرها في كل طلب.</small>
      </div>
      <div className="card col" style={{ gap: 8 }}>
        <b>عمولة ثابتة لقسم معيّن <small>(ج.م للقطعة — فاضي = النسبة)</small></b>
        <div className="grid" style={st("--m:1;--d:3")}>
          {treeList(cats.data ?? []).map((c) => (
            <div key={c.id} className="row" style={{ gap: 8 }}>
              <span className="sp" style={{ fontSize: 13.5, fontWeight: c.depth ? 400 : 700 }}>{c.depth ? "— " : ""}{c.name}</span>
              <input className="in" style={{ width: 90 }} inputMode="numeric" placeholder={`${rs.commissionPct}%`} value={rs.catCommission?.[c.id] ?? ""} onChange={(e) => { const v = num(e.target.value); const next = { ...(rs.catCommission || {}) }; if (v === undefined) delete next[c.id]; else next[c.id] = v; setRs({ ...rs, catCommission: next }); }} />
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
              <input className="in" style={{ width: 80 }} inputMode="numeric" placeholder={String(rs.shipDefault)} value={rs.ship?.[g] ?? ""} onChange={(e) => { const v = num(e.target.value); const next = { ...(rs.ship || {}) }; if (v === undefined) delete next[g]; else next[g] = v; setRs({ ...rs, ship: next }); }} />
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
