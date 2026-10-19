"use client";
/* البيع بالعمولة — the reseller's area: apply, browse products with commission, build an order for a customer,
 * follow orders, and the commission wallet. All reads/writes go through /api/resell/* (prices re-checked on the server). */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { allActiveProductsCached, listCategories } from "@/lib/store";
import { GOVERNORATES } from "@/lib/config";
import { fmt, dateStr } from "@/lib/format";
import { st } from "@/lib/style";
import { treeList, productCats } from "@/lib/cats";
import { norm } from "@/components/SearchBox";
import { RequireLogin } from "@/components/Guard";
import { Empty, Img, Loading } from "@/components/Ui";
import {
  PAYOUT_METHODS, PHONE_RE, RSTATUS, RSTATUS_TONE, baseUnit, canResell, defaultCommission, isRetail, maxQty, minQty, modeLabel, money, normPhone,
  resellSettings, shipFor, wallet, wholesaleMin, type Payout, type RCustomer, type ROrder, type RStatus, type Reseller, type ResellSettings,
} from "@/lib/resell";
import type { Category, Product, Promo } from "@/lib/types";

type Line = { productId: string; qty: number; commission: number | null }; // null = suggested commission
type Draft = { lines: Line[]; customer: RCustomer };
const EMPTY_CUSTOMER: RCustomer = { name: "", phone: "", phone2: "", governorate: "", address: "", notes: "" };
const DRAFT = "al3ataba-resell-draft";
const loadDraft = (): Draft => {
  try { const d = JSON.parse(localStorage.getItem(DRAFT) || ""); if (Array.isArray(d.lines) && d.customer) return d; } catch { /* empty */ }
  return { lines: [], customer: { ...EMPTY_CUSTOMER } };
};
const ji = (n: number) => `${fmt(n)} ج.م`;

async function api<T>(user: User, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `حصلت مشكلة (${r.status})`);
  return j as T;
}

function Badge({ s }: { s: RStatus }) {
  const c = RSTATUS_TONE[s];
  return <span className="bd" style={c === "e" ? { background: "#fdecea", color: "#b3261e" } : c === "w" ? { background: "#fff4d6", color: "#8a6100" } : { background: "#e6f4ec", color: "#1e6b43" }}>{RSTATUS[s]}</span>;
}

/* ---------- apply / edit profile ---------- */
function Apply({ user, me, onSaved }: { user: User; me: Reseller | null; onSaved: () => void }) {
  const [f, setF] = useState({ name: me?.name || user.displayName || "", phone: me?.phone || "", governorate: me?.governorate || "", payMethod: me?.payMethod || "vcash", payNumber: me?.payNumber || "" });
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const send = async () => {
    setErr(""); setOk("");
    const phone = normPhone(f.phone);
    if (f.name.trim().length < 3) return setErr("اكتب اسمك");
    if (!PHONE_RE.test(phone)) return setErr("رقم التليفون لازم يكون 11 رقم يبدأ بـ 01");
    if (!f.governorate) return setErr("اختار المحافظة");
    if (f.payMethod === "vcash" && !PHONE_RE.test(normPhone(f.payNumber))) return setErr("رقم فودافون كاش لازم يكون 11 رقم يبدأ بـ 01");
    if (f.payNumber.trim().length < 4) return setErr("اكتب رقم فودافون كاش أو عنوان إنستاباي عشان نحوّلك أرباحك");
    setBusy(true);
    try { await api(user, "/api/resell/me", { ...f, phone }); setOk(me ? "اتحفظ ✓" : ""); onSaved(); }
    catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  return (
    <div className={me ? "" : "wc"} style={{ maxWidth: 640 }}>
      {!me && <>
        <h1 style={{ fontSize: 24 }}>البيع بالعمولة</h1>
        <div className="card col mt" style={{ gap: 8 }}>
          <b>اكسب من غير رأس مال</b>
          <small>• اختار منتجات من العتبة، وكل منتج عليه عمولة جاهزة تقدر تغيّرها.<br />• اعرضها على عملائك، ولما حد يطلب اكتب بياناته هنا.<br />• إحنا بنأكد مع العميل ونشحن ونحصّل.<br />• أول ما الطلب يتسلّم، عمولتك بتنزل في محفظتك وتسحبها فودافون كاش أو إنستاباي.</small>
        </div>
      </>}
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
        {ok && <div className="ok">{ok}</div>}
        <button className="btn" disabled={busy} onClick={send}>{busy ? "جاري الحفظ…" : me ? "حفظ البيانات" : "قدّم على حساب بائع"}</button>
      </div>
    </div>
  );
}

/* ---------- main ---------- */
function Body() {
  const { user, settings, promos } = useApp();
  const router = useRouter();
  const tab = useSearchParams().get("tab") || "products";
  const go = (t: string) => router.replace(`/resell?tab=${t}`);
  const rs = resellSettings(settings.resell);

  const acc = useAsync(async () => (user ? api<{ me: Reseller | null; orders: ROrder[]; payouts: Payout[] }>(user, "/api/resell/me") : null), [user?.uid]);
  const me = acc.data?.me ?? null;
  const approved = me?.status === "approved";
  const cat = useAsync(async () => (approved ? Promise.all([allActiveProductsCached(), listCategories()]) : null), [approved]);

  const [draft, setDraft] = useState<Draft>({ lines: [], customer: { ...EMPTY_CUSTOMER } });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setDraft(loadDraft()); setLoaded(true); }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem(DRAFT, JSON.stringify(draft)); } catch { /* ignore */ } }, [draft, loaded]);

  if (!user || acc.loading) return <div className="wc"><div className="skel" /></div>;
  if (acc.error) return <div className="wc"><Empty icon="ph-warning" title="مقدرتش أحمّل حسابك" sub={acc.error}><button className="btn" onClick={acc.reload}>جرّب تاني</button></Empty></div>;
  if (!me) return <Apply user={user} me={null} onSaved={acc.reload} />;
  if (me.status === "pending") return <div className="wc"><Empty icon="ph-hourglass" title="طلبك قيد المراجعة" sub="فريق العتبة هيراجع بياناتك ويفعّل حسابك قريب. هتلاقي كل حاجة هنا أول ما يتفعّل."><button className="btn o" onClick={acc.reload}>تحديث</button></Empty></div>;
  if (me.status === "suspended") return <div className="wc"><Empty icon="ph-prohibit" title="حساب البيع بالعمولة موقوف" sub="كلّم الدعم لو محتاج تعرف السبب." /></div>;

  const products = (cat.data?.[0] ?? []).filter(canResell);
  const cats = cat.data?.[1] ?? [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const orders = acc.data?.orders ?? [], payouts = acc.data?.payouts ?? [];
  const w = wallet(orders, payouts, rs.holdDays);
  const addLine = (p: Product) => setDraft((d) => (d.lines.some((l) => l.productId === p.id) ? d : { ...d, lines: [...d.lines, { productId: p.id, qty: minQty(p), commission: null }] }));

  return (
    <div className="wc">
      <div className="row wrap" style={{ marginBottom: 12, alignItems: "flex-end", gap: 8 }}>
        <div className="sp"><h1 style={{ fontSize: 22 }}>البيع بالعمولة</h1><small className="mu">أهلاً {me.name}</small></div>
        <span className="bd" style={{ background: "#e6f4ec", color: "#1e6b43" }}>متاح: {ji(w.available)}</span>
        <span className="bd" style={{ background: "#fff4d6", color: "#8a6100" }}>معلّق: {ji(w.pending)}</span>
      </div>
      <div className="seg" style={{ marginBottom: 14, overflowX: "auto" }}>
        {[["products", "المنتجات"], ["order", `الطلب${draft.lines.length ? ` (${draft.lines.length})` : ""}`], ["orders", "طلباتي"], ["wallet", "المحفظة"], ["profile", "حسابي"]].map(([k, t]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{t}</button>)}
      </div>
      {tab === "products" && <Products loading={cat.loading} products={products} cats={cats} rs={rs} promos={promos} inDraft={new Set(draft.lines.map((l) => l.productId))} onAdd={addLine} goOrder={() => go("order")} />}
      {tab === "order" && <OrderForm draft={draft} setDraft={setDraft} byId={byId} cats={cats} rs={rs} promos={promos} loading={cat.loading} user={user} onDone={() => { acc.reload(); go("orders"); }} />}
      {tab === "orders" && <Orders data={orders} />}
      {tab === "wallet" && <Wallet w={w} orders={orders} payouts={payouts} me={me} user={user} holdDays={rs.holdDays ?? 3} reload={acc.reload} />}
      {tab === "profile" && <Apply user={user} me={me} onSaved={acc.reload} />}
    </div>
  );
}

/* ---------- products with commission ---------- */
function Products({ loading, products, cats, rs, promos, inDraft, onAdd, goOrder }: { loading: boolean; products: Product[]; cats: Category[]; rs: ResellSettings; promos: Promo[]; inDraft: Set<string>; onAdd: (p: Product) => void; goOrder: () => void }) {
  const [q, setQ] = useState(""); const [c, setC] = useState(""); const [n, setN] = useState(60);
  const all = useMemo(() => {
    const t = norm(q).split(" ").filter(Boolean);
    return products.filter((p) => (!c || productCats(p, cats).includes(c)) && (!t.length || t.every((x) => norm(`${p.name} ${p.categoryName}`).includes(x))));
  }, [products, q, c, cats]);
  if (loading) return <Loading rows={4} />;
  const list = all.slice(0, n);
  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <input className="in sp" style={{ minWidth: 200 }} placeholder="ابحث عن منتج" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ maxWidth: 220 }} value={c} onChange={(e) => setC(e.target.value)}><option value="">كل الأقسام</option>{treeList(cats).map((x) => <option key={x.id} value={x.id}>{x.depth ? `— ${x.name}` : x.name}</option>)}</select>
        {inDraft.size > 0 && <button className="btn" onClick={goOrder}><i className="ph ph-receipt" />كمّل الطلب ({inDraft.size})</button>}
      </div>
      <small className="mu" style={{ display: "block", marginBottom: 10 }}>{all.length} منتج متاح · سعر القطاعي = سعر الجملة + {rs.retailPct}% · العمولة المقترحة {rs.commissionPct}% وتقدر تغيّرها في الطلب</small>
      {!list.length ? <Empty icon="ph-package" title="مفيش منتجات" /> : (
        <div className="grid" style={st("--m:2;--d:4")}>
          {list.map((p) => {
            const mq = minQty(p), base = baseUnit(p, mq, promos, rs), com = defaultCommission(p, base, rs, cats);
            const wm = wholesaleMin(p), wb = wm > 1 ? baseUnit(p, wm, promos, rs) : 0;
            return (
              <div key={p.id} className="card col" style={{ padding: 10, gap: 6 }}>
                <Link href={`/product/${p.id}`} target="_blank"><Img src={p.images?.[0]} ic="ph-package" ratio={1} w={360} /></Link>
                <b style={{ fontSize: 13.5, lineHeight: 1.4, minHeight: 38 }}>{p.name}</b>
                <small className="mu">{modeLabel(p)}</small>
                <div className="col" style={{ gap: 2, fontSize: 13 }}>
                  <span>سعرك{isRetail(p, mq) ? " قطاعي" : ""}: <b>{ji(base)}</b>{mq > 1 ? ` (من ${mq})` : ""}</span>
                  <span style={{ color: "#1e6b43" }}>عمولتك: <b>{ji(com)}</b> / قطعة</span>
                  <span className="mu">تبيع للعميل بـ {ji(base + com)}</span>
                  {wb > 0 && mq < wm && <small className="mu">جملة من {wm} {p.unit}: {ji(wb)} للقطعة</small>}
                </div>
                <button className={`btn sm2 ${inDraft.has(p.id) ? "o" : ""}`} onClick={() => onAdd(p)} disabled={inDraft.has(p.id)}>{inDraft.has(p.id) ? <><i className="ph ph-check" />في الطلب</> : <><i className="ph ph-plus" />أضف للطلب</>}</button>
              </div>
            );
          })}
        </div>
      )}
      {all.length > n && <div className="c mt2"><button className="btn o" onClick={() => setN(n + 60)}>عرض المزيد</button></div>}
    </>
  );
}

/* ---------- build an order ---------- */
function OrderForm({ draft, setDraft, byId, cats, rs, promos, loading, user, onDone }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; byId: Map<string, Product>; cats: Category[]; rs: ResellSettings; promos: Promo[]; loading: boolean; user: User; onDone: () => void }) {
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [ok, setOk] = useState("");
  if (loading) return <Loading rows={2} />;
  const gone = draft.lines.filter((l) => !byId.has(l.productId)).length;
  const setLine = (id: string, v: Partial<Line>) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.productId === id ? { ...l, ...v } : l)) }));
  const drop = (id: string) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.productId !== id) }));
  const cu = draft.customer;
  const setC = (k: keyof RCustomer) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, customer: { ...d.customer, [k]: e.target.value } }));
  const rows = draft.lines.filter((l) => byId.has(l.productId)).map((l) => {
    const p = byId.get(l.productId)!; const base = baseUnit(p, l.qty, promos, rs);
    const com = l.commission ?? defaultCommission(p, base, rs, cats);
    return { l, p, base, com, price: base + com };
  });
  const subtotal = money(rows.reduce((a, r) => a + r.price * r.l.qty, 0));
  const commission = money(rows.reduce((a, r) => a + r.com * r.l.qty, 0));
  const shipping = cu.governorate ? shipFor(cu.governorate, rs) : 0;

  const send = async () => {
    setErr(""); setOk("");
    if (!rows.length) return setErr("ضيف منتج واحد على الأقل من تبويب المنتجات");
    for (const r of rows) if (!(r.l.qty >= minQty(r.p) && r.l.qty <= maxQty(r.p))) return setErr(`الكمية في "${r.p.name}" لازم تكون من ${minQty(r.p)}${maxQty(r.p) < 10000 ? ` لـ ${maxQty(r.p)}` : ""}`);
    if (cu.name.trim().length < 3) return setErr("اكتب اسم المستلم");
    if (!PHONE_RE.test(normPhone(cu.phone))) return setErr("رقم المستلم لازم يكون 11 رقم يبدأ بـ 01");
    if (cu.phone2 && !PHONE_RE.test(normPhone(cu.phone2))) return setErr("الرقم التاني مش صحيح");
    if (!cu.governorate) return setErr("اختار المحافظة");
    if (cu.address.trim().length < 8) return setErr("اكتب العنوان بالتفصيل (المنطقة، الشارع، رقم العمارة…)");
    setBusy(true);
    try {
      const j = await api<{ total: number; commissionTotal: number }>(user, "/api/resell/order", { customer: cu, items: rows.map((x) => ({ productId: x.p.id, qty: x.l.qty, commission: x.l.commission })) });
      setOk(`اتبعت الطلب ✓ العميل هيدفع ${ji(j.total)} وعمولتك ${ji(j.commissionTotal)}`);
      setDraft({ lines: [], customer: { ...EMPTY_CUSTOMER } });
      setTimeout(onDone, 1500);
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
      <div className="sp col" style={{ gap: 10, minWidth: 280 }}>
        {gone > 0 && <div className="alert">{gone} منتج في الطلب مبقاش متاح ومش هيتبعت.</div>}
        {!rows.length && <Empty icon="ph-receipt" title="الطلب فاضي" sub="ضيف منتجات من تبويب المنتجات." />}
        {rows.map(({ l, p, base, com, price }) => (
          <div key={p.id} className="card row" style={{ gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 72, flex: "none" }}><Img src={p.images?.[0]} ratio={1} w={160} /></div>
            <div className="sp col" style={{ gap: 6 }}>
              <div className="row"><b className="sp" style={{ fontSize: 14 }}>{p.name}</b><button className="ico sm" aria-label="شيل" onClick={() => drop(p.id)}><i className="ph ph-x" /></button></div>
              <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
                <div className="fld" style={{ width: 130 }}><label>الكمية ({p.unit})</label>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn o sm2" style={{ minWidth: 32, padding: 0 }} onClick={() => setLine(p.id, { qty: Math.max(minQty(p), l.qty - 1) })}>−</button>
                    <input className="in" style={{ textAlign: "center", padding: "0 4px" }} inputMode="numeric" value={l.qty} onChange={(e) => setLine(p.id, { qty: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)) })} />
                    <button className="btn o sm2" style={{ minWidth: 32, padding: 0 }} onClick={() => setLine(p.id, { qty: Math.min(maxQty(p), l.qty + 1) })}>+</button>
                  </div>
                </div>
                <div className="fld" style={{ width: 140 }}><label>عمولتك / قطعة</label><input className="in" inputMode="numeric" value={l.commission ?? com} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setLine(p.id, { commission: v === "" ? 0 : Number(v) }); }} /></div>
                {l.commission !== null && <button className="btn o sm2" onClick={() => setLine(p.id, { commission: null })}>رجّع المقترحة</button>}
              </div>
              <small className="mu">{isRetail(p, l.qty) ? "سعر قطاعي" : "سعر جملة"}: {ji(base)} + عمولتك {ji(com)} = <b style={{ color: "var(--tx)" }}>{ji(price)}</b> للقطعة · الإجمالي {ji(price * l.qty)}</small>
              {isRetail(p, l.qty) && wholesaleMin(p) > 1 && maxQty(p) >= wholesaleMin(p) && <small style={{ color: "#1e6b43" }}>لو العميل أخد {wholesaleMin(p)} {p.unit} أو أكتر، سعرك ينزل لـ {ji(baseUnit(p, wholesaleMin(p), promos, rs))} (جملة).</small>}
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
function Orders({ data }: { data: ROrder[] }) {
  const [f, setF] = useState("");
  const [open, setOpen] = useState("");
  const list = data.filter((o) => !f || o.status === f);
  const count = (s: string) => data.filter((o) => o.status === s).length;
  return (
    <>
      <div className="scr" style={{ marginBottom: 10 }}>
        <button className={`chip${!f ? " on" : ""}`} onClick={() => setF("")}>الكل ({data.length})</button>
        {(Object.keys(RSTATUS) as RStatus[]).map((s) => <button key={s} className={`chip${f === s ? " on" : ""}`} onClick={() => setF(s)}>{RSTATUS[s]} ({count(s)})</button>)}
      </div>
      {!list.length ? <Empty icon="ph-receipt" title="مفيش طلبات" /> : (
        <div className="col" style={{ gap: 10 }}>
          {list.map((o) => {
            const lost = o.status === "returned" || o.status === "cancelled";
            return (
              <div key={o.id} className="card col" style={{ gap: 6, cursor: "pointer" }} onClick={() => setOpen(open === o.id ? "" : o.id)}>
                <div className="row wrap" style={{ gap: 8 }}><b className="sp">{o.customer.name} · {o.customer.governorate}</b><Badge s={o.status} /><small className="mu">{dateStr(o.createdAt)}</small></div>
                <small className="mu">{o.items.map((i) => `${i.name} × ${i.qty}`).join("، ")}</small>
                <div className="row wrap" style={{ gap: 14, fontSize: 13.5 }}>
                  <span>العميل يدفع: <b>{ji(o.total)}</b></span>
                  <span style={{ color: lost ? "#b3261e" : "#1e6b43" }}>عمولتك: <b>{ji(o.commissionTotal)}</b>{lost ? " (مش هتتحسب)" : o.status === "delivered" ? "" : " (لما يتسلّم)"}</span>
                  <small className="mu">#{o.id.slice(0, 6)}</small>
                </div>
                {open === o.id && (
                  <div className="col" style={{ gap: 4, borderTop: "1px solid var(--bd)", paddingTop: 8, fontSize: 13 }}>
                    <span>{o.customer.phone}{o.customer.phone2 ? ` · ${o.customer.phone2}` : ""} — {o.customer.address}</span>
                    {o.items.map((i) => <span key={i.productId}>{i.name}: {i.qty} × ({ji(i.base)} + {ji(i.commission)}) = {ji(i.price * i.qty)}</span>)}
                    <span>الشحن: {ji(o.shipping)}</span>
                    <span className="mu">{(o.history || []).map((h) => `${RSTATUS[h.status]} ${new Date(h.at).toLocaleDateString("ar-EG")}`).join(" ← ")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- wallet ---------- */
function Wallet({ w, orders, payouts, me, user, holdDays, reload }: { w: ReturnType<typeof wallet>; orders: ROrder[]; payouts: Payout[]; me: Reseller; user: User; holdDays: number; reload: () => void }) {
  const [amount, setAmount] = useState(""); const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const open = payouts.some((p) => p.status === "requested");
  const ask = async () => {
    setErr(""); setOk("");
    const a = Number(amount || w.available);
    if (!(a > 0)) return setErr("مفيش رصيد متاح للسحب");
    if (a > w.available) return setErr(`المتاح ${ji(w.available)} بس`);
    setBusy(true);
    try {
      const j = await api<{ amount: number }>(user, "/api/resell/payout", { amount: a });
      setOk(`اتبعت طلب سحب ${ji(j.amount)} ✓ هيتحوّل على ${PAYOUT_METHODS[me.payMethod]} ${me.payNumber}`); setAmount(""); reload();
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  const moves = [
    ...orders.filter((o) => o.status === "delivered" && o.deliveredAt).map((o) => ({ at: o.deliveredAt!, t: `عمولة طلب ${o.customer.name}`, v: o.commissionTotal, s: o.deliveredAt! + holdDays * 864e5 > Date.now() ? `معلّقة لحد ${new Date(o.deliveredAt! + holdDays * 864e5).toLocaleDateString("ar-EG")}` : "متاحة" })),
    ...payouts.map((p) => ({ at: (p.createdAt?.seconds ?? 0) * 1000, t: `سحب على ${PAYOUT_METHODS[p.method as "vcash"] || p.method}`, v: -p.amount, s: p.status === "paid" ? "اتحوّل" : p.status === "rejected" ? `مرفوض${p.note ? `: ${p.note}` : ""} (الفلوس رجعت لرصيدك)` : "قيد التحويل" })),
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
          <div key={i} className="row" style={{ fontSize: 13.5, borderBottom: "1px solid var(--bd)", padding: "6px 0", gap: 8 }}>
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
