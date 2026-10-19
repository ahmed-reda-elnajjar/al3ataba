"use client";
/* البيع بالعمولة — the reseller's area: apply, browse products with commission, build an order for a customer,
 * follow orders, and the commission wallet. Prices are re-checked on the server when the order is sent. */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { allActiveProductsCached, listCategories, withId } from "@/lib/store";
import { GOVERNORATES } from "@/lib/config";
import { fmt, dateStr, ms } from "@/lib/format";
import { st } from "@/lib/style";
import { treeList, productCats } from "@/lib/cats";
import { norm } from "@/components/SearchBox";
import { RequireLogin } from "@/components/Guard";
import { Empty, Img, Loading } from "@/components/Ui";
import {
  PAYOUT_METHODS, PHONE_RE, RSTATUS, RSTATUS_TONE, baseUnit, canResell, defaultCommission, maxQty, minQty, modeLabel, money, normPhone,
  resellSettings, shipFor, wallet, type Payout, type RCustomer, type ROrder, type Reseller,
} from "@/lib/resell";
import type { Category, Product } from "@/lib/types";

type Line = { productId: string; qty: number; commission: number };
const DRAFT = "al3ataba-resell-draft";
const loadDraft = (): { lines: Line[]; customer: RCustomer } => {
  try { const d = JSON.parse(localStorage.getItem(DRAFT) || ""); if (Array.isArray(d.lines)) return d; } catch { /* empty */ }
  return { lines: [], customer: { name: "", phone: "", phone2: "", governorate: "", address: "", notes: "" } };
};
const ji = (n: number) => `${fmt(n)} ج.م`;

function Badge({ s }: { s: keyof typeof RSTATUS }) {
  const c = RSTATUS_TONE[s];
  return <span className={`bd ${c}`} style={c === "e" ? { background: "#fdecea", color: "#b3261e" } : c === "w" ? { background: "#fff4d6", color: "#8a6100" } : { background: "#e6f4ec", color: "#1e6b43" }}>{RSTATUS[s]}</span>;
}

/* ---------- apply ---------- */
function Apply({ uid, me, reload }: { uid: string; me: Reseller | null; reload: () => void }) {
  const [f, setF] = useState({ name: me?.name || "", phone: me?.phone || "", governorate: me?.governorate || "", payMethod: me?.payMethod || "vcash", payNumber: me?.payNumber || "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const send = async () => {
    setErr("");
    const phone = normPhone(f.phone);
    if (f.name.trim().length < 3) return setErr("اكتب اسمك");
    if (!PHONE_RE.test(phone)) return setErr("رقم التليفون لازم يكون 11 رقم يبدأ بـ 01");
    if (!f.governorate) return setErr("اختار المحافظة");
    if (f.payNumber.trim().length < 4) return setErr("اكتب رقم فودافون كاش أو عنوان إنستاباي عشان نحوّلك أرباحك");
    setBusy(true);
    try {
      await setDoc(doc(dbI(), "resellers", uid), { uid, name: f.name.trim(), phone, governorate: f.governorate, payMethod: f.payMethod, payNumber: f.payNumber.trim(), status: "pending", createdAt: serverTimestamp() });
      reload();
    } catch { setErr("مقدرتش أبعت الطلب — جرّب تاني"); }
    setBusy(false);
  };
  return (
    <div className="wc" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24 }}>البيع بالعمولة</h1>
      <div className="card col mt" style={{ gap: 8 }}>
        <b>اكسب من غير رأس مال</b>
        <small>• اختار منتجات من العتبة، وحط عمولتك على كل قطعة.<br />• اعرضها على عملائك، ولما حد يطلب اكتب بياناته هنا.<br />• إحنا بنأكد مع العميل ونشحن ونحصّل.<br />• أول ما الطلب يتسلّم، عمولتك بتنزل في محفظتك وتسحبها فودافون كاش أو إنستاباي.</small>
      </div>
      <div className="card col mt" style={{ gap: 12 }}>
        <b>بيانات حساب البائع</b>
        <div className="fld"><label>الاسم</label><input className="in" value={f.name} onChange={set("name")} /></div>
        <div className="grid" style={st("--m:1;--d:2")}>
          <div className="fld"><label>رقم التليفون</label><input className="in" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="01xxxxxxxxx" /></div>
          <div className="fld"><label>المحافظة</label><select className="in" value={f.governorate} onChange={set("governorate")}><option value="">اختار</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
        </div>
        <div className="grid" style={st("--m:1;--d:2")}>
          <div className="fld"><label>استلام الأرباح على</label><select className="in" value={f.payMethod} onChange={set("payMethod")}><option value="vcash">فودافون كاش</option><option value="instapay">إنستاباي</option></select></div>
          <div className="fld"><label>{f.payMethod === "vcash" ? "رقم فودافون كاش" : "عنوان إنستاباي / الرقم"}</label><input className="in" value={f.payNumber} onChange={set("payNumber")} /></div>
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={busy} onClick={send}>{busy ? "جاري الإرسال…" : "قدّم على حساب بائع"}</button>
      </div>
    </div>
  );
}

/* ---------- main ---------- */
function Body() {
  const { user, settings, promos } = useApp();
  const uid = user?.uid || "";
  const router = useRouter();
  const sp = useSearchParams();
  const tab = sp.get("tab") || "products";
  const go = (t: string) => router.replace(`/resell?tab=${t}`);
  const rs = resellSettings(settings.resell);

  const prof = useAsync(async () => {
    const s = await getDoc(doc(dbI(), "resellers", uid));
    return s.exists() ? withId<Reseller>(s) : null;
  }, [uid]);
  const me = prof.data ?? null;
  const approved = me?.status === "approved";

  const cat = useAsync(async () => (approved ? Promise.all([allActiveProductsCached(), listCategories()]) : null), [approved]);
  const mine = useAsync(async () => {
    if (!approved) return null;
    const [o, p] = await Promise.all([
      getDocs(query(collection(dbI(), "rorders"), where("resellerId", "==", uid))),
      getDocs(query(collection(dbI(), "payouts"), where("resellerId", "==", uid))),
    ]);
    return {
      orders: o.docs.map((d) => withId<ROrder>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
      payouts: p.docs.map((d) => withId<Payout>(d)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
    };
  }, [approved, uid]);

  // draft order (kept in the browser so nothing is lost on refresh)
  const [draft, setDraft] = useState(loadDraft);
  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify(draft)); } catch { /* ignore */ } }, [draft]);

  if (prof.loading) return <div className="wc"><div className="skel" /></div>;
  if (!me) return <Apply uid={uid} me={null} reload={prof.reload} />;
  if (me.status === "pending") return <div className="wc"><Empty icon="ph-hourglass" title="طلبك قيد المراجعة" sub="فريق العتبة هيراجع بياناتك ويفعّل حسابك قريب. هتلاقي كل حاجة هنا أول ما يتفعّل." /></div>;
  if (me.status === "suspended") return <div className="wc"><Empty icon="ph-prohibit" title="حساب البيع بالعمولة موقوف" sub="كلّم الدعم لو محتاج تعرف السبب." /></div>;

  const products = (cat.data?.[0] ?? []).filter(canResell);
  const cats = cat.data?.[1] ?? [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const w = mine.data ? wallet(mine.data.orders, mine.data.payouts, rs.holdDays) : null;

  const addLine = (p: Product) => {
    setDraft((d) => d.lines.some((l) => l.productId === p.id) ? d : { ...d, lines: [...d.lines, { productId: p.id, qty: minQty(p), commission: defaultCommission(p, rs, cats) }] });
  };

  return (
    <div className="wc">
      <div className="row wrap" style={{ marginBottom: 12, alignItems: "flex-end" }}>
        <div className="sp"><h1 style={{ fontSize: 22 }}>البيع بالعمولة</h1><small className="mu">أهلاً {me.name}</small></div>
        {w && <div className="row" style={{ gap: 8 }}><span className="bd" style={{ background: "#e6f4ec", color: "#1e6b43" }}>متاح: {ji(w.available)}</span><span className="bd" style={{ background: "#fff4d6", color: "#8a6100" }}>معلّق: {ji(w.pending)}</span></div>}
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        {[["products", "المنتجات"], ["order", `الطلب${draft.lines.length ? ` (${draft.lines.length})` : ""}`], ["orders", "طلباتي"], ["wallet", "المحفظة"], ["profile", "حسابي"]].map(([k, t]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{t}</button>)}
      </div>
      {tab === "products" && <Products loading={cat.loading} products={products} cats={cats} rs={rs} promos={promos} inDraft={new Set(draft.lines.map((l) => l.productId))} onAdd={addLine} goOrder={() => go("order")} />}
      {tab === "order" && <OrderForm draft={draft} setDraft={setDraft} byId={byId} rs={rs} promos={promos} loading={cat.loading} user={user!} onDone={() => { mine.reload(); go("orders"); }} />}
      {tab === "orders" && <Orders data={mine.data?.orders} loading={mine.loading} />}
      {tab === "wallet" && <Wallet w={w} data={mine.data} me={me} user={user!} holdDays={rs.holdDays ?? 3} reload={mine.reload} />}
      {tab === "profile" && <Apply uid={uid} me={me} reload={prof.reload} />}
    </div>
  );
}

/* ---------- products with commission ---------- */
function Products({ loading, products, cats, rs, promos, inDraft, onAdd, goOrder }: { loading: boolean; products: Product[]; cats: Category[]; rs: ReturnType<typeof resellSettings>; promos: ReturnType<typeof useApp>["promos"]; inDraft: Set<string>; onAdd: (p: Product) => void; goOrder: () => void }) {
  const [q, setQ] = useState(""); const [c, setC] = useState("");
  const list = useMemo(() => {
    const t = norm(q).split(" ").filter(Boolean);
    return products.filter((p) => (!c || productCats(p, cats).includes(c)) && (!t.length || t.every((x) => norm(`${p.name} ${p.categoryName}`).includes(x)))).slice(0, 120);
  }, [products, q, c, cats]);
  if (loading) return <Loading rows={4} />;
  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <input className="in sp" style={{ minWidth: 200 }} placeholder="ابحث عن منتج" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ maxWidth: 220 }} value={c} onChange={(e) => setC(e.target.value)}><option value="">كل الأقسام</option>{treeList(cats).map((x) => <option key={x.id} value={x.id}>{x.depth ? `— ${x.name}` : x.name}</option>)}</select>
        {inDraft.size > 0 && <button className="btn" onClick={goOrder}><i className="ph ph-receipt" />كمّل الطلب ({inDraft.size})</button>}
      </div>
      {!list.length ? <Empty icon="ph-package" title="مفيش منتجات" /> : (
        <div className="grid" style={st("--m:2;--d:4")}>
          {list.map((p) => {
            const mq = minQty(p), base = baseUnit(p, mq, promos), com = defaultCommission(p, rs, cats);
            return (
              <div key={p.id} className="card col" style={{ padding: 10, gap: 6 }}>
                <Link href={`/product/${p.id}`}><Img src={p.images?.[0]} ic="ph-package" ratio={1} w={360} /></Link>
                <b style={{ fontSize: 13.5, lineHeight: 1.4, minHeight: 38 }}>{p.name}</b>
                <small className="mu">{modeLabel(p)}{mq > 1 ? ` · من ${mq} ${p.unit}` : ""}</small>
                <div className="col" style={{ gap: 2, fontSize: 13 }}>
                  <span>سعرنا: <b>{ji(base)}</b></span>
                  <span style={{ color: "#1e6b43" }}>عمولتك: <b>{ji(com)}</b> / قطعة</span>
                  <span className="mu">السعر للعميل: {ji(base + com)}</span>
                  {p.tiers.length > 1 && <small className="mu">جملة: {p.tiers.slice(1).map((t) => `${t.min}+ بـ ${t.price}`).join(" · ")}</small>}
                </div>
                <button className={`btn sm2 ${inDraft.has(p.id) ? "o" : ""}`} onClick={() => onAdd(p)} disabled={inDraft.has(p.id)}>{inDraft.has(p.id) ? <><i className="ph ph-check" />في الطلب</> : <><i className="ph ph-plus" />أضف للطلب</>}</button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- build an order ---------- */
function OrderForm({ draft, setDraft, byId, rs, promos, loading, user, onDone }: { draft: { lines: Line[]; customer: RCustomer }; setDraft: React.Dispatch<React.SetStateAction<{ lines: Line[]; customer: RCustomer }>>; byId: Map<string, Product>; rs: ReturnType<typeof resellSettings>; promos: ReturnType<typeof useApp>["promos"]; loading: boolean; user: NonNullable<ReturnType<typeof useApp>["user"]>; onDone: () => void }) {
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [ok, setOk] = useState("");
  if (loading) return <Loading rows={2} />;
  const lines = draft.lines.filter((l) => byId.has(l.productId));
  const setLine = (id: string, v: Partial<Line>) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.productId === id ? { ...l, ...v } : l)) }));
  const drop = (id: string) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.productId !== id) }));
  const cu = draft.customer;
  const setC = (k: keyof RCustomer) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, customer: { ...d.customer, [k]: e.target.value } }));
  const rows = lines.map((l) => { const p = byId.get(l.productId)!; const base = baseUnit(p, l.qty, promos); return { l, p, base, price: base + (l.commission || 0) }; });
  const subtotal = money(rows.reduce((a, r) => a + r.price * r.l.qty, 0));
  const commission = money(rows.reduce((a, r) => a + (r.l.commission || 0) * r.l.qty, 0));
  const shipping = cu.governorate ? shipFor(cu.governorate, rs) : 0;

  const send = async () => {
    setErr(""); setOk("");
    if (!rows.length) return setErr("ضيف منتج واحد على الأقل من تبويب المنتجات");
    for (const r of rows) if (!(r.l.qty >= minQty(r.p) && r.l.qty <= maxQty(r.p))) return setErr(`الكمية في "${r.p.name}" لازم تكون من ${minQty(r.p)}`);
    if (cu.name.trim().length < 3) return setErr("اكتب اسم المستلم");
    if (!PHONE_RE.test(normPhone(cu.phone))) return setErr("رقم المستلم لازم يكون 11 رقم يبدأ بـ 01");
    if (!cu.governorate) return setErr("اختار المحافظة");
    if (cu.address.trim().length < 8) return setErr("اكتب العنوان بالتفصيل (المنطقة، الشارع، رقم العمارة…)");
    setBusy(true);
    try {
      const r = await fetch("/api/resell/order", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() }, body: JSON.stringify({ customer: cu, items: rows.map((x) => ({ productId: x.p.id, qty: x.l.qty, commission: x.l.commission || 0 })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setOk(`اتبعت الطلب ✓ العميل هيدفع ${ji(j.total)} وعمولتك ${ji(j.commissionTotal)}`);
      setDraft({ lines: [], customer: { name: "", phone: "", phone2: "", governorate: "", address: "", notes: "" } });
      setTimeout(onDone, 1500);
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
      <div className="sp col" style={{ gap: 10, minWidth: 280 }}>
        {!rows.length && <Empty icon="ph-receipt" title="الطلب فاضي" sub="ضيف منتجات من تبويب المنتجات." />}
        {rows.map(({ l, p, base, price }) => (
          <div key={p.id} className="card row" style={{ gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 72, flex: "none" }}><Img src={p.images?.[0]} ratio={1} w={160} /></div>
            <div className="sp col" style={{ gap: 6 }}>
              <div className="row"><b className="sp" style={{ fontSize: 14 }}>{p.name}</b><button className="ico sm" aria-label="شيل" onClick={() => drop(p.id)}><i className="ph ph-x" /></button></div>
              <div className="row wrap" style={{ gap: 8 }}>
                <div className="fld" style={{ width: 110 }}><label>الكمية ({p.unit})</label><input className="in" inputMode="numeric" value={l.qty} onChange={(e) => setLine(p.id, { qty: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)) })} /></div>
                <div className="fld" style={{ width: 130 }}><label>عمولتك / قطعة</label><input className="in" inputMode="numeric" value={l.commission} onChange={(e) => setLine(p.id, { commission: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)) })} /></div>
              </div>
              <small className="mu">سعرنا {ji(base)} + عمولتك {ji(l.commission || 0)} = <b style={{ color: "var(--tx)" }}>{ji(price)}</b> للقطعة · الإجمالي {ji(price * l.qty)}{minQty(p) > 1 ? ` · أقل كمية ${minQty(p)}` : ""}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="card col" style={{ width: 360, maxWidth: "100%", gap: 10 }}>
        <b>بيانات المستلم</b>
        <div className="fld"><label>الاسم</label><input className="in" value={cu.name} onChange={setC("name")} /></div>
        <div className="grid" style={st("--m:2;--d:2")}>
          <div className="fld"><label>التليفون</label><input className="in" inputMode="tel" value={cu.phone} onChange={setC("phone")} placeholder="01xxxxxxxxx" /></div>
          <div className="fld"><label>تليفون تاني (اختياري)</label><input className="in" inputMode="tel" value={cu.phone2} onChange={setC("phone2")} /></div>
        </div>
        <div className="fld"><label>المحافظة</label><select className="in" value={cu.governorate} onChange={setC("governorate")}><option value="">اختار</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
        <div className="fld"><label>العنوان بالتفصيل</label><textarea className="in" rows={2} value={cu.address} onChange={setC("address")} placeholder="المنطقة، الشارع، رقم العمارة، علامة مميزة" /></div>
        <div className="fld"><label>ملاحظات (اختياري)</label><input className="in" value={cu.notes} onChange={setC("notes")} /></div>
        <div className="col" style={{ gap: 4, fontSize: 14, borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
          <div className="row"><span className="sp">المنتجات</span><b>{ji(subtotal)}</b></div>
          <div className="row"><span className="sp">الشحن {cu.governorate ? `(${cu.governorate})` : ""}</span><b>{cu.governorate ? ji(shipping) : "اختار المحافظة"}</b></div>
          <div className="row" style={{ fontSize: 16 }}><span className="sp">العميل يدفع</span><b>{ji(subtotal + shipping)}</b></div>
          <div className="row" style={{ color: "#1e6b43" }}><span className="sp">عمولتك</span><b>{ji(commission)}</b></div>
        </div>
        {err && <div className="err">{err}</div>}
        {ok && <div className="ok">{ok}</div>}
        <button className="btn" disabled={busy || !rows.length} onClick={send}>{busy ? "جاري الإرسال…" : "ابعت الطلب"}</button>
        <small className="mu">فريقنا هيتصل بالعميل يأكد قبل الشحن. الدفع عند الاستلام.</small>
      </div>
    </div>
  );
}

/* ---------- orders ---------- */
function Orders({ data, loading }: { data?: ROrder[]; loading: boolean }) {
  const [f, setF] = useState("");
  if (loading) return <Loading rows={2} />;
  const list = (data ?? []).filter((o) => !f || o.status === f);
  const count = (s: string) => (data ?? []).filter((o) => o.status === s).length;
  return (
    <>
      <div className="scr" style={{ marginBottom: 10 }}>
        <button className={`chip${!f ? " on" : ""}`} onClick={() => setF("")}>الكل ({data?.length ?? 0})</button>
        {(Object.keys(RSTATUS) as (keyof typeof RSTATUS)[]).map((s) => <button key={s} className={`chip${f === s ? " on" : ""}`} onClick={() => setF(s)}>{RSTATUS[s]} ({count(s)})</button>)}
      </div>
      {!list.length ? <Empty icon="ph-receipt" title="مفيش طلبات" /> : (
        <div className="col" style={{ gap: 10 }}>
          {list.map((o) => (
            <div key={o.id} className="card col" style={{ gap: 6 }}>
              <div className="row wrap" style={{ gap: 8 }}><b className="sp">{o.customer.name} · {o.customer.governorate}</b><Badge s={o.status} /><small className="mu">{dateStr(o.createdAt)}</small></div>
              <small className="mu">{o.items.map((i) => `${i.name} × ${i.qty}`).join("، ")}</small>
              <div className="row wrap" style={{ gap: 14, fontSize: 13.5 }}>
                <span>العميل يدفع: <b>{ji(o.total)}</b></span>
                <span style={{ color: o.status === "returned" || o.status === "cancelled" ? "#b3261e" : "#1e6b43" }}>عمولتك: <b>{ji(o.commissionTotal)}</b>{o.status === "returned" || o.status === "cancelled" ? " (مش هتتحسب)" : o.status === "delivered" ? "" : " (لما يتسلّم)"}</span>
                <small className="mu">#{o.id.slice(0, 6)}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- wallet ---------- */
function Wallet({ w, data, me, user, holdDays, reload }: { w: ReturnType<typeof wallet> | null; data?: { orders: ROrder[]; payouts: Payout[] } | null; me: Reseller; user: NonNullable<ReturnType<typeof useApp>["user"]>; holdDays: number; reload: () => void }) {
  const [amount, setAmount] = useState(""); const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  if (!w || !data) return <Loading rows={2} />;
  const open = data.payouts.some((p) => p.status === "requested");
  const ask = async () => {
    setErr(""); setOk("");
    const a = Number(amount || w.available);
    if (!(a > 0)) return setErr("مفيش رصيد متاح للسحب");
    setBusy(true);
    try {
      const r = await fetch("/api/resell/payout", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() }, body: JSON.stringify({ amount: a, method: me.payMethod, number: me.payNumber }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setOk(`اتبعت طلب سحب ${ji(j.amount)} ✓ هيتحوّل على ${PAYOUT_METHODS[me.payMethod]} ${me.payNumber}`); setAmount(""); reload();
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  const moves = [
    ...data.orders.filter((o) => o.status === "delivered" && o.deliveredAt).map((o) => ({ at: o.deliveredAt!, t: `عمولة طلب ${o.customer.name}`, v: o.commissionTotal, s: o.deliveredAt! + holdDays * 864e5 > Date.now() ? "معلّقة" : "متاحة" })),
    ...data.payouts.map((p) => ({ at: (p.createdAt?.seconds ?? 0) * 1000, t: `سحب على ${PAYOUT_METHODS[p.method as "vcash"] || p.method}`, v: -p.amount, s: p.status === "paid" ? "اتحوّل" : p.status === "rejected" ? "مرفوض" : "قيد التحويل" })),
  ].sort((a, b) => b.at - a.at);
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="grid" style={st("--m:2;--d:4")}>
        <div className="stat"><small>متاح للسحب</small><b style={{ color: "#1e6b43" }}>{ji(w.available)}</b></div>
        <div className="stat"><small>معلّق ({holdDays} أيام بعد التسليم)</small><b>{ji(w.pending)}</b></div>
        <div className="stat"><small>متوقّع (طلبات لسه ماتسلمتش)</small><b>{ji(w.expected)}</b></div>
        <div className="stat"><small>اتحوّلك لحد دلوقتي</small><b>{ji(w.paid)}</b></div>
      </div>
      <div className="card col" style={{ gap: 8 }}>
        <b>سحب الأرباح</b>
        {open ? <small>عندك طلب سحب قيد التحويل ({ji(w.requested)}). تقدر تطلب تاني بعد ما يتحوّل.</small> : (
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="in" style={{ maxWidth: 160 }} inputMode="decimal" placeholder={`${w.available}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            <button className="btn" disabled={busy || w.available <= 0} onClick={ask}>{busy ? "…" : "اطلب سحب"}</button>
            <small className="mu">هيتحوّل على {PAYOUT_METHODS[me.payMethod]}: {me.payNumber} (تقدر تغيّره من "حسابي")</small>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {ok && <div className="ok">{ok}</div>}
      </div>
      <div className="card col" style={{ gap: 6 }}>
        <b>الحركات</b>
        {!moves.length ? <small className="mu">لسه مفيش حركات — أول طلب يتسلّم عمولته هتظهر هنا.</small> : moves.map((m, i) => (
          <div key={i} className="row" style={{ fontSize: 13.5, borderBottom: "1px solid var(--bd)", padding: "6px 0" }}>
            <span className="sp">{m.t} <small className="mu">· {new Date(m.at).toLocaleDateString("ar-EG")} · {m.s}</small></span>
            <b style={{ color: m.v < 0 ? "#b3261e" : "#1e6b43" }}>{m.v < 0 ? "−" : "+"}{ji(Math.abs(m.v))}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return <RequireLogin why="سجّل دخولك عشان تبيع بالعمولة."><Suspense fallback={<div className="wc"><div className="skel" /></div>}><Body /></Suspense></RequireLogin>;
}
