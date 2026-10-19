"use client";
/* لوحة المتابعة والتحليل: money, orders, products, users, merchants, resellers, automatic problem detection + AI advisor. */
import { useState } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { useApp } from "@/lib/providers";
import { useAsync } from "@/lib/hooks";
import { fmt } from "@/lib/format";
import { st } from "@/lib/style";
import { Empty } from "@/components/Ui";
import { RSTATUS } from "@/lib/resell";
import { ORDER_STATUS } from "@/lib/config";
import type { Insights } from "@/lib/insights";

const ji = (n: number) => `${fmt(n)} ج.م`;
const dt = (ms: number) => (ms ? new Date(ms).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "2-digit" }) : "—");
type Advice = { summary: string; problems: { title: string; detail: string; priority: string }[]; opportunities: { title: string; detail: string }[]; actions: { title: string; detail: string; impact: string }[]; provider: string; at: number };

async function call<T>(user: User, days: number, ai = false): Promise<T> {
  const r = await fetch(`/api/admin/insights?days=${days}`, { method: ai ? "POST" : "GET", cache: "no-store", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() }, body: ai ? JSON.stringify({ days }) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `حصلت مشكلة (${r.status})`);
  return j as T;
}

function Delta({ v }: { v: number | null }) {
  if (v === null) return null;
  const up = v >= 0;
  return <small style={{ color: up ? "#1e6b43" : "#b3261e", fontWeight: 700 }}><i className={`ph ph-trend-${up ? "up" : "down"}`} /> {up ? "+" : ""}{v}% عن الفترة اللي قبلها</small>;
}
function Tile({ t, v, sub, children }: { t: string; v: string; sub?: string; children?: React.ReactNode }) {
  return <div className="stat"><small>{t}</small><b>{v}</b>{sub && <small className="mu">{sub}</small>}{children}</div>;
}

/** Single-series daily bars (one hue, rounded data-ends, 2px gaps, hover readout). */
function Bars({ title, data, fmtV }: { title: string; data: { d: string; v: number }[]; fmtV: (n: number) => string }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((x) => x.v)), total = data.reduce((a, x) => a + x.v, 0);
  const cur = hi !== null ? data[hi] : null;
  return (
    <div className="card col" style={{ gap: 8 }}>
      <div className="row"><b className="sp">{title}</b><small className="mu">{cur ? `${new Date(cur.d).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}: ${fmtV(cur.v)}` : `الإجمالي: ${fmtV(total)}`}</small></div>
      <div role="img" aria-label={`${title} — الإجمالي ${fmtV(total)}`} style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, direction: "ltr", borderBottom: "1px solid var(--bd)" }} onMouseLeave={() => setHi(null)}>
        {data.map((x, i) => (
          <div key={x.d} title={`${x.d}: ${fmtV(x.v)}`} onMouseEnter={() => setHi(i)} onClick={() => setHi(i)} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "pointer" }}>
            <div style={{ width: "100%", height: `${Math.max(x.v ? 3 : 0, (x.v / max) * 100)}%`, background: "var(--pa)", opacity: hi === null || hi === i ? 1 : 0.45, borderRadius: "4px 4px 0 0" }} />
          </div>
        ))}
      </div>
      <div className="row" style={{ direction: "ltr", fontSize: 11, color: "var(--mu)" }}><span className="sp">{data[0]?.d.slice(5)}</span><span>{data[data.length - 1]?.d.slice(5)}</span></div>
    </div>
  );
}

function Table({ head, rows, empty = "مفيش بيانات لسه" }: { head: string[]; rows: (string | number | React.ReactNode)[][]; empty?: string }) {
  if (!rows.length) return <small className="mu">{empty}</small>;
  return <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr>{head.map((h) => <th key={h} style={{ textAlign: "start", fontSize: 12.5, color: "var(--mu)" }}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} style={{ fontSize: 13.5 }}>{c}</td>)}</tr>)}</tbody></table></div>;
}

const LEVEL: Record<string, [string, string, string]> = { critical: ["حرج", "#b3261e", "ph-warning-octagon"], serious: ["مهم", "#b25e00", "ph-warning"], warning: ["تنبيه", "#8a6100", "ph-info"] };

export default function InsightsPage() {
  const { user } = useApp();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState("overview");
  const { data, loading, error, reload } = useAsync(async () => (user ? call<Insights>(user, days) : null), [user?.uid, days]);
  const [ai, setAi] = useState<Advice | null>(null); const [aiBusy, setAiBusy] = useState(false); const [aiErr, setAiErr] = useState("");
  const [uq, setUq] = useState("");
  const askAi = async () => { if (!user) return; setAiBusy(true); setAiErr(""); try { setAi(await call<Advice>(user, days, true)); } catch (e) { setAiErr(String((e as Error).message)); } setAiBusy(false); };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <h2 className="sp" style={{ fontSize: 20 }}>لوحة المتابعة والتحليل</h2>
        <select className="in" style={{ width: 150 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((d) => <option key={d} value={d}>آخر {d} يوم</option>)}</select>
        <button className="btn o sm2" onClick={reload}><i className="ph ph-arrows-clockwise" />تحديث</button>
      </div>
      <div className="seg" style={{ overflowX: "auto" }}>
        {[["overview", "نظرة عامة"], ["money", "الحسابات"], ["people", "المستخدمين"], ["resellers", "البائعين"], ["merchants", "التجار"], ["products", "المنتجات"], ["ai", "المستشار الذكي"]].map(([k, t]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t}</button>)}
      </div>
      {error ? <Empty icon="ph-warning" title="مقدرتش أحمّل البيانات" sub={error}><button className="btn" onClick={reload}>جرّب تاني</button></Empty>
        : loading || !data ? <div className="skel" style={{ minHeight: 300 }} /> : (() => {
          const k = data.kpis;
          return (
            <>
              {tab === "overview" && (
                <>
                  <div className="grid" style={st("--m:2;--d:4")}>
                    <Tile t={`مبيعات الجملة (${days} يوم)`} v={ji(k.gmv)} sub={`${k.orders} طلب · متوسط ${ji(k.aov)}`}><Delta v={k.gmvChange} /></Tile>
                    <Tile t="مبيعات البيع بالعمولة" v={ji(k.resellGmv)} sub={`${k.resellOrders} طلب`}><Delta v={k.resellChange} /></Tile>
                    <Tile t="هامش الربح التقديري" v={ji(k.margin)} sub={k.marginPct !== null ? `${k.marginPct}% من المنتجات اللي سعر موردها معروف` : "محتاج أسعار المورد على المنتجات"} />
                    <Tile t="مستخدمين جداد" v={fmt(k.newUsers)} sub={k.usersListed ? `من ${fmt(k.users)} مستخدم · نشط ${fmt(k.activeUsers)}` : "قائمة المستخدمين مش متاحة"} />
                  </div>
                  <div className="card col" style={{ gap: 8 }}>
                    <div className="row"><b className="sp">مشاكل محتاجة تدخّل ({data.issues.length})</b></div>
                    {!data.issues.length ? <small style={{ color: "#1e6b43" }}><i className="ph ph-check-circle" /> مفيش مشاكل واضحة دلوقتي.</small> : data.issues.map((i, n) => {
                      const [lb, c, ic] = LEVEL[i.level];
                      return (
                        <div key={n} className="row" style={{ gap: 10, alignItems: "flex-start", borderBottom: "1px solid var(--bd)", padding: "8px 0" }}>
                          <i className={`ph-fill ${ic}`} style={{ color: c, fontSize: 20, flex: "none" }} aria-hidden />
                          <div className="sp col" style={{ gap: 2 }}><b style={{ fontSize: 14 }}><span style={{ color: c }}>[{lb}]</span> {i.title}</b><small className="mu">{i.detail}</small></div>
                          {i.link && <Link href={i.link} className="btn o sm2">افتح</Link>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid" style={st("--m:1;--d:2")}>
                    <Bars title="المبيعات اليومية (جملة + عمولة)" data={data.daily.map((x) => ({ d: x.d, v: x.gmv + x.rgmv }))} fmtV={ji} />
                    <Bars title="عدد الطلبات اليومي" data={data.daily.map((x) => ({ d: x.d, v: x.orders + x.rorders }))} fmtV={(n) => `${fmt(n)} طلب`} />
                  </div>
                  <div className="grid" style={st("--m:1;--d:2")}>
                    <div className="card col" style={{ gap: 8 }}><b>الأكثر مبيعاً</b><Table head={["المنتج", "الكمية", "المبيعات"]} rows={data.topProducts.map((p) => [<Link key={p.id} href={`/product/${p.id}`}>{p.name}</Link>, fmt(p.qty), ji(p.revenue)])} /></div>
                    <div className="card col" style={{ gap: 8 }}><b>المحافظات</b><Table head={["المحافظة", "الطلبات", "المبيعات"]} rows={data.governorates.map((g) => [g.name, fmt(g.orders), ji(g.revenue)])} /></div>
                  </div>
                </>
              )}

              {tab === "money" && (
                <>
                  <div className="grid" style={st("--m:2;--d:4")}>
                    <Tile t={`إجمالي المبيعات (${days} يوم)`} v={ji(k.gmv + k.resellGmv)} sub={`جملة ${ji(k.gmv)} + عمولة ${ji(k.resellGmv)}`} />
                    <Tile t="هامش الربح التقديري" v={ji(k.margin)} sub={k.marginPct !== null ? `${k.marginPct}%` : "—"} />
                    <Tile t="عمولات مستحقة للبائعين" v={ji(k.commissionsDue)} sub={`متاح ${ji(k.commissionsAvailable)} · معلّق ${ji(k.commissionsPending)}`} />
                    <Tile t="طلبات سحب مستنية تحويل" v={ji(k.payoutsOpen)} sub={`اتحوّل لحد دلوقتي ${ji(k.payoutsPaid)}`} />
                  </div>
                  <Bars title="مبيعات الجملة يومياً" data={data.daily.map((x) => ({ d: x.d, v: x.gmv }))} fmtV={ji} />
                  <Bars title="مبيعات البيع بالعمولة يومياً" data={data.daily.map((x) => ({ d: x.d, v: x.rgmv }))} fmtV={ji} />
                  <div className="grid" style={st("--m:1;--d:2")}>
                    <div className="card col" style={{ gap: 8 }}><b>حالات طلبات الجملة (كل الوقت)</b><Table head={["الحالة", "العدد"]} rows={data.status.orders.map(([s, n]) => [ORDER_STATUS[s] || s, fmt(n)])} /></div>
                    <div className="card col" style={{ gap: 8 }}><b>حالات طلبات البيع بالعمولة</b><Table head={["الحالة", "العدد"]} rows={data.status.rorders.map(([s, n]) => [RSTATUS[s as keyof typeof RSTATUS] || s, fmt(n)])} /></div>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {k.returnRate !== null && <span className="bd">نسبة المرتجع (عمولة): {k.returnRate}%</span>}
                    {k.cancelRate !== null && <span className="bd">نسبة الإلغاء (جملة): {k.cancelRate}%</span>}
                  </div>
                  <small className="mu">الهامش التقديري = سعر البيع − سعر المورد المحفوظ على المنتج، للمنتجات اللي ليها سعر مورد بس (من غير الشحن والمصاريف).</small>
                </>
              )}

              {tab === "people" && (
                <>
                  <div className="grid" style={st("--m:2;--d:4")}>
                    <Tile t="كل المستخدمين المسجلين" v={k.usersListed ? fmt(k.users) : "—"} sub={k.usersListed ? `جداد ${fmt(k.newUsers)} · نشط ${fmt(k.activeUsers)} (${days} يوم)` : "مش متاحة"} />
                    <Tile t="اشتروا مرة على الأقل" v={fmt(k.buyers)} sub={`رجعوا اشتروا تاني: ${fmt(k.repeatBuyers)}`} />
                    <Tile t="بائعين بالعمولة" v={fmt(k.resellersApproved)} sub={`${k.resellersPending} مستني الموافقة`} />
                    <Tile t="تجار" v={fmt(k.merchantsApproved)} sub={`${k.merchantsPending} مستني الموافقة · طلبات عروض أسعار مفتوحة ${k.openRfqs}`} />
                  </div>
                  <Bars title="تسجيلات جديدة يومياً" data={data.daily.map((x) => ({ d: x.d, v: x.users }))} fmtV={(n) => `${fmt(n)} مستخدم`} />
                  <div className="card col" style={{ gap: 8 }}>
                    <div className="row wrap" style={{ gap: 8 }}><b className="sp">المستخدمين ({data.users.length} الأحدث)</b><input className="in" style={{ maxWidth: 260 }} placeholder="بحث بالاسم أو الإيميل أو التليفون" value={uq} onChange={(e) => setUq(e.target.value)} /></div>
                    {!k.usersListed ? <small className="mu">قائمة الحسابات محتاجة صلاحية Firebase Authentication على حساب الخدمة (Firebase Admin). الأرقام التانية شغالة عادي.</small> : (
                      <Table head={["المستخدم", "التليفون", "سجّل", "آخر دخول", "طلبات", "اشترى بـ", "الدور"]} rows={data.users.filter((u) => !uq.trim() || `${u.name} ${u.email} ${u.phone}`.includes(uq.trim())).map((u) => [u.name || u.email || "—", u.phone || "—", dt(u.createdAt), dt(u.lastLoginAt), fmt(u.orders), ji(u.spent), u.roles.join("، ") || "عميل"])} />
                    )}
                  </div>
                </>
              )}

              {tab === "resellers" && (
                <div className="card col" style={{ gap: 8 }}>
                  <div className="row"><b className="sp">البائعين بالعمولة ({data.resellers.length})</b><Link href="/admin/resell?tab=resellers" className="btn o sm2">إدارة البائعين</Link></div>
                  <Table head={["البائع", "الحالة", "طلبات", `آخر ${days} يوم`, "نسبة التسليم", "مبيعاته", "عمولته", "متاح للسحب", "اتحوّله"]} rows={data.resellers.map((r) => [<span key={r.id}>{r.name}<br /><small className="mu">{r.phone} · {r.governorate}</small></span>, r.status === "approved" ? "مفعّل" : r.status === "pending" ? "مستني" : "موقوف", fmt(r.orders), fmt(r.orders30), r.deliveryRate === null ? "—" : <b style={{ color: r.deliveryRate < 70 ? "#b3261e" : "#1e6b43" }}>{r.deliveryRate}%</b>, ji(r.sales), ji(r.commission), ji(r.available), ji(r.paid)])} empty="لسه مفيش بائعين" />
                </div>
              )}

              {tab === "merchants" && (
                <div className="card col" style={{ gap: 8 }}>
                  <div className="row"><b className="sp">التجار ({data.merchants.length})</b><Link href="/admin/merchants" className="btn o sm2">إدارة التجار</Link></div>
                  <Table head={["التاجر", "النوع", "الحالة", "منتجات", "منشور", "طلبات", "مبيعات"]} rows={data.merchants.map((m) => [<span key={m.id}>{m.name}{m.verified ? " ✓" : ""}<br /><small className="mu">{m.governorate}</small></span>, m.type || "—", m.status === "approved" ? "مقبول" : m.status === "pending" ? "مستني" : "مرفوض", fmt(m.products), fmt(m.activeProducts), fmt(m.orders), ji(m.revenue)])} empty="لسه مفيش تجار مسجلين" />
                </div>
              )}

              {tab === "products" && (
                <>
                  <div className="grid" style={st("--m:2;--d:4")}>
                    <Tile t="منتجات منشورة" v={fmt(k.activeProducts)} sub={`من ${fmt(k.products)} · مستني مراجعة ${k.pendingProducts} · مخفي ${k.hiddenProducts}`} />
                    <Tile t="عدّى شهر من غير بيع" v={fmt(data.catalog.neverSold)} />
                    <Tile t="من غير صورة" v={fmt(data.catalog.noImage)} />
                    <Tile t="خلصان عند المورد" v={fmt(data.catalog.outOfStock)} sub={`هامش أقل من 5%: ${data.catalog.lowMargin}`} />
                  </div>
                  <div className="grid" style={st("--m:1;--d:2")}>
                    <div className="card col" style={{ gap: 8 }}><b>الأقسام الأكثر مبيعاً</b><Table head={["القسم", "الكمية", "المبيعات"]} rows={data.topCategories.map((c) => [c.name, fmt(c.qty), ji(c.revenue)])} /></div>
                    <div className="card col" style={{ gap: 8 }}><b>المنتجات الأكثر مبيعاً</b><Table head={["المنتج", "طلبات", "الكمية", "المبيعات"]} rows={data.topProducts.map((p) => [<Link key={p.id} href={`/product/${p.id}`}>{p.name}</Link>, fmt(p.orders), fmt(p.qty), ji(p.revenue)])} /></div>
                  </div>
                </>
              )}

              {tab === "ai" && (
                <div className="col" style={{ gap: 12 }}>
                  <div className="card col" style={{ gap: 8 }}>
                    <b>المستشار الذكي</b>
                    <small className="mu">بيقرا أرقام آخر {days} يوم (مجمّعة، من غير أسماء أو أرقام تليفونات) ويطلّعلك المشاكل وفرص التوسع وخطوات عملية. بيستخدم مفاتيح الذكاء الاصطناعي المتضافة (Gemini / Groq / Meta / …) وبيبدّل بينهم لوحده.</small>
                    <button className="btn" style={{ alignSelf: "flex-start" }} disabled={aiBusy} onClick={askAi}>{aiBusy ? "بيحلل… (ممكن ياخد دقيقة)" : ai ? "حلّل تاني" : "حلّل البيانات واقترح"}</button>
                    {aiErr && <div className="err">{aiErr}</div>}
                  </div>
                  {ai && (
                    <>
                      <div className="card col" style={{ gap: 6 }}><b>الخلاصة</b><p style={{ whiteSpace: "pre-wrap" }}>{ai.summary}</p><small className="mu">بواسطة {ai.provider}</small></div>
                      <div className="card col" style={{ gap: 6 }}><b>المشاكل والمخاطر</b>{ai.problems.map((p, i) => <div key={i} style={{ borderBottom: "1px solid var(--bd)", padding: "6px 0" }}><b style={{ fontSize: 14 }}>{p.title} {p.priority && <span className="bd">{p.priority}</span>}</b><br /><small>{p.detail}</small></div>)}</div>
                      <div className="card col" style={{ gap: 6 }}><b>فرص التوسع</b>{ai.opportunities.map((p, i) => <div key={i} style={{ borderBottom: "1px solid var(--bd)", padding: "6px 0" }}><b style={{ fontSize: 14 }}>{p.title}</b><br /><small>{p.detail}</small></div>)}</div>
                      <div className="card col" style={{ gap: 6 }}><b>اعمل إيه الأسبوع ده</b>{ai.actions.map((p, i) => <div key={i} style={{ borderBottom: "1px solid var(--bd)", padding: "6px 0" }}><b style={{ fontSize: 14 }}>{i + 1}. {p.title}</b><br /><small>{p.detail}</small>{p.impact && <><br /><small style={{ color: "#1e6b43" }}>الأثر: {p.impact}</small></>}</div>)}</div>
                    </>
                  )}
                </div>
              )}
              <small className="mu">آخر تحديث: {new Date(data.at).toLocaleString("ar-EG")}</small>
            </>
          );
        })()}
    </div>
  );
}
