/* Server-only: the admin dashboard numbers — money, orders, products, users, merchants, resellers — plus automatic
 * problem detection. Reads with the service account (admin-only route). Personal data stays in the admin view;
 * only aggregated numbers are sent to the AI advisor. */
import { listSA, listUsersSA, type AuthUser } from "./sa";
import { resellSettings, wallet, type Payout, type ROrder, type Reseller } from "./resell";
import type { Category, Merchant, Order, Product, Rfq, Settings } from "./types";
import { getDocSA } from "./sa";

const DAY = 864e5;
const t = (x?: { seconds: number }) => (x?.seconds ?? 0) * 1000;
const dayKey = (ms: number) => new Date(ms + 2 * 3600e3).toISOString().slice(0, 10); // Cairo date
const r0 = (n: number) => Math.round(n);

export type Issue = { level: "critical" | "serious" | "warning"; title: string; detail: string; link?: string };
export type Insights = Awaited<ReturnType<typeof buildInsights>>;

export async function buildInsights(days = 30) {
  const [products, orders, rorders, payouts, resellers, merchants, cats, rfqs, users, site] = await Promise.all([
    listSA<Product>("products", 5000),
    listSA<Order>("orders", 5000),
    listSA<ROrder>("rorders", 5000),
    listSA<Payout>("payouts", 2000),
    listSA<Reseller>("resellers", 2000),
    listSA<Merchant>("merchants", 2000),
    listSA<Category>("categories", 500),
    listSA<Rfq>("rfqs", 2000).catch(() => [] as Rfq[]),
    listUsersSA(),
    getDocSA<Settings>("settings/site"),
  ]);
  const rs = resellSettings(site?.resell);
  const now = Date.now(), from = now - days * DAY, prevFrom = from - days * DAY;
  const byId = new Map(products.map((p) => [p.id, p]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  /* ---- cost & margin (supplier price saved on imported/marked-up products) ---- */
  const unitCost = (productId: string, price: number, qty: number) => {
    const p = byId.get(productId);
    if (!p?.basePrices?.length || !p.tiers?.length) return null;
    const tiers = [...p.tiers].sort((a, b) => a.min - b.min);
    let i = 0; tiers.forEach((x, k) => { if (qty >= x.min) i = k; });
    const c = p.basePrices[Math.min(i, p.basePrices.length - 1)];
    return c > 0 && c <= price * 1.5 ? c : null;
  };

  /* ---- normal (trader) orders ---- */
  const live = (s: string) => s !== "cancelled";
  const oIn = orders.filter((o) => t(o.createdAt) >= from);
  const oPrev = orders.filter((o) => t(o.createdAt) >= prevFrom && t(o.createdAt) < from);
  const gmv = (l: Order[]) => l.filter((o) => live(o.status)).reduce((a, o) => a + (o.subtotal || 0), 0);

  /* ---- reseller orders ---- */
  const rIn = rorders.filter((o) => t(o.createdAt) >= from);
  const rPrev = rorders.filter((o) => t(o.createdAt) >= prevFrom && t(o.createdAt) < from);
  const rLive = (s: string) => s !== "cancelled" && s !== "returned";
  const rgmv = (l: ROrder[]) => l.filter((o) => rLive(o.status)).reduce((a, o) => a + (o.subtotal || 0), 0);

  // our margin estimate (only items whose supplier price is known)
  let margin = 0, marginBase = 0;
  // (only COMPLETED orders count — a request isn't a sale until it's delivered)
  for (const o of oIn.filter((x) => x.status === "delivered")) for (const i of o.items || []) { const c = unitCost(i.productId, i.price, i.qty); if (c !== null) { margin += (i.price - c) * i.qty; marginBase += i.price * i.qty; } }
  for (const o of rIn.filter((x) => x.status === "delivered")) for (const i of o.items || []) { const c = unitCost(i.productId, i.base, i.qty); if (c !== null) { margin += (i.base - c) * i.qty; marginBase += i.base * i.qty; } }

  /* ---- order pipeline: requested → in progress → completed / lost (both kinds of orders) ---- */
  type Row = { kind: "wholesale" | "resell"; id: string; no: string; who: string; gov: string; status: string; value: number; at: number; doneAt: number; commission: number };
  const rows: Row[] = [
    ...orders.map((o) => ({ kind: "wholesale" as const, id: o.id, no: o.orderNo || o.id.slice(0, 6), who: o.buyerName || "—", gov: o.address?.governorate || "", status: o.status, value: o.subtotal || 0, at: t(o.createdAt), doneAt: t(o.createdAt), commission: 0 })),
    ...rorders.map((o) => ({ kind: "resell" as const, id: o.id, no: o.id.slice(0, 6), who: o.customer?.name || "—", gov: o.customer?.governorate || "", status: o.status, value: o.subtotal || 0, at: t(o.createdAt), doneAt: o.deliveredAt || t(o.createdAt), commission: o.commissionTotal || 0 })),
  ];
  const stage = (st: string) => (st === "delivered" ? "done" : st === "cancelled" || st === "returned" ? "lost" : "progress");
  const sum = (l: Row[]) => r0(l.reduce((a, x) => a + x.value, 0));
  const inP = rows.filter((x) => x.at >= from), prevP = rows.filter((x) => x.at >= prevFrom && x.at < from);
  const doneIn = rows.filter((x) => x.status === "delivered" && x.doneAt >= from), donePrev = rows.filter((x) => x.status === "delivered" && x.doneAt >= prevFrom && x.doneAt < from);
  const STAGES = ["new", "confirmed", "shipped", "delivered", "returned", "cancelled"];
  const pipeline = STAGES.map((st) => { const l = inP.filter((x) => x.status === st); return { status: st, count: l.length, value: sum(l) }; });
  const flow = {
    requested: { count: inP.length, value: sum(inP), prev: sum(prevP) },
    progress: { count: inP.filter((x) => stage(x.status) === "progress").length, value: sum(inP.filter((x) => stage(x.status) === "progress")) },
    done: { count: doneIn.length, value: sum(doneIn), prev: sum(donePrev), commissions: r0(doneIn.reduce((a, x) => a + x.commission, 0)) },
    lost: { count: inP.filter((x) => stage(x.status) === "lost").length, value: sum(inP.filter((x) => stage(x.status) === "lost")) },
  };
  const recent = [...rows].sort((a, b) => b.at - a.at).slice(0, 10).map((x) => ({ ...x, value: r0(x.value) }));

  /* ---- daily series ---- */
  const daily: Record<string, { d: string; gmv: number; orders: number; rgmv: number; rorders: number; users: number; requested: number; done: number }> = {};
  for (let k = days - 1; k >= 0; k--) { const d = dayKey(now - k * DAY); daily[d] = { d, gmv: 0, orders: 0, rgmv: 0, rorders: 0, users: 0, requested: 0, done: 0 }; }
  for (const o of oIn) { const x = daily[dayKey(t(o.createdAt))]; if (x) { x.orders++; if (live(o.status)) x.gmv += o.subtotal || 0; } }
  for (const o of rIn) { const x = daily[dayKey(t(o.createdAt))]; if (x) { x.rorders++; if (rLive(o.status)) x.rgmv += o.subtotal || 0; } }
  for (const o of orders) { const x = daily[dayKey(t(o.createdAt))]; if (x && o.status !== "cancelled") x.requested += o.subtotal || 0; if (x && o.status === "delivered") x.done += o.subtotal || 0; }
  for (const o of rorders) { const x = daily[dayKey(t(o.createdAt))]; if (x && o.status !== "cancelled") x.requested += o.subtotal || 0; const y = o.status === "delivered" && o.deliveredAt ? daily[dayKey(o.deliveredAt)] : undefined; if (y) y.done += o.subtotal || 0; }
  const realUsers = users.filter((u) => !u.anonymous);
  for (const u of realUsers) { const x = daily[dayKey(u.createdAt)]; if (x) x.users++; }

  /* ---- product / category / governorate rankings (last N days, both kinds of orders) ---- */
  const prod: Record<string, { id: string; name: string; qty: number; revenue: number; orders: number }> = {};
  const catAgg: Record<string, { name: string; qty: number; revenue: number }> = {};
  const govAgg: Record<string, { name: string; orders: number; revenue: number }> = {};
  const add = (pid: string, name: string, qty: number, rev: number) => {
    (prod[pid] ||= { id: pid, name, qty: 0, revenue: 0, orders: 0 }); prod[pid].qty += qty; prod[pid].revenue += rev; prod[pid].orders++;
    const cid = byId.get(pid)?.categoryId || "-"; (catAgg[cid] ||= { name: catName.get(cid) || byId.get(pid)?.categoryName || "غير معروف", qty: 0, revenue: 0 }); catAgg[cid].qty += qty; catAgg[cid].revenue += rev;
  };
  for (const o of oIn.filter((x) => live(x.status))) { for (const i of o.items || []) add(i.productId, i.name, i.qty, i.price * i.qty); const g = o.address?.governorate || "غير محدد"; (govAgg[g] ||= { name: g, orders: 0, revenue: 0 }); govAgg[g].orders++; govAgg[g].revenue += o.subtotal || 0; }
  for (const o of rIn.filter((x) => rLive(x.status))) { for (const i of o.items || []) add(i.productId, i.name, i.qty, i.price * i.qty); const g = o.customer?.governorate || "غير محدد"; (govAgg[g] ||= { name: g, orders: 0, revenue: 0 }); govAgg[g].orders++; govAgg[g].revenue += o.subtotal || 0; }
  const soldIds = new Set([...orders.flatMap((o) => (o.items || []).map((i) => i.productId)), ...rorders.flatMap((o) => (o.items || []).map((i) => i.productId))]);

  /* ---- people ---- */
  const ordersByUser: Record<string, { n: number; spent: number; last: number }> = {};
  for (const o of orders) { const u = (ordersByUser[o.userId] ||= { n: 0, spent: 0, last: 0 }); u.n++; if (live(o.status)) u.spent += o.subtotal || 0; u.last = Math.max(u.last, t(o.createdAt)); }
  const resellerIds = new Set(resellers.map((r) => r.id)), merchantIds = new Set(merchants.map((m) => m.id));
  const buyers = Object.keys(ordersByUser).length, repeat = Object.values(ordersByUser).filter((u) => u.n > 1).length;
  const userRows = realUsers.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200).map((u: AuthUser) => ({
    uid: u.uid, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    orders: ordersByUser[u.uid]?.n || 0, spent: r0(ordersByUser[u.uid]?.spent || 0),
    roles: [resellerIds.has(u.uid) ? "بائع بالعمولة" : "", merchantIds.has(u.uid) ? "تاجر" : ""].filter(Boolean),
  }));

  const resellerRows = resellers.map((r) => {
    const mine = rorders.filter((o) => o.resellerId === r.id), w = wallet(mine, payouts.filter((p) => p.resellerId === r.id), rs.holdDays);
    const done = mine.filter((o) => o.status === "delivered").length, back = mine.filter((o) => o.status === "returned").length;
    return { id: r.id, name: r.name, phone: r.phone, governorate: r.governorate, status: r.status, orders: mine.length, orders30: mine.filter((o) => t(o.createdAt) >= from).length, delivered: done, returned: back, deliveryRate: done + back ? r0((done / (done + back)) * 100) : null, sales: r0(mine.filter((o) => rLive(o.status)).reduce((a, o) => a + o.subtotal, 0)), commission: r0(w.earned + w.pending), available: w.available, pending: w.pending, paid: w.paid };
  }).sort((a, b) => b.sales - a.sales);

  const merchantRows = merchants.map((m) => {
    const mp = products.filter((p) => p.merchantId === m.id), mo = orders.filter((o) => o.merchantId === m.id);
    return { id: m.id, name: m.name, type: m.type, governorate: m.governorate, status: m.status, verified: !!m.verified, products: mp.length, activeProducts: mp.filter((p) => p.status === "active").length, orders: mo.length, revenue: r0(gmv(mo)) };
  }).sort((a, b) => b.revenue - a.revenue || b.products - a.products);

  /* ---- money owed ---- */
  const allW = wallet(rorders, payouts, rs.holdDays);
  const payoutsOpen = payouts.filter((p) => p.status === "requested");

  /* ---- automatic problem detection ---- */
  const issues: Issue[] = [];
  const active = products.filter((p) => p.status === "active");
  const noImg = active.filter((p) => !(p.images || []).some((u) => typeof u === "string" && u.startsWith("http")));
  const noPrice = active.filter((p) => !p.tiers?.length || p.tiers.some((x) => !(x.price > 0)));
  const pend = products.filter((p) => p.status === "pending");
  const oos = products.filter((p) => (p as Product & { outOfStock?: boolean }).outOfStock);
  const stuckNew = orders.filter((o) => o.status === "new" && now - t(o.createdAt) > DAY).length + rorders.filter((o) => o.status === "new" && now - t(o.createdAt) > DAY).length;
  const stuckShip = rorders.filter((o) => o.status === "shipped" && now - (o.history?.slice(-1)[0]?.at || t(o.createdAt)) > 7 * DAY).length;
  const oldPayouts = payoutsOpen.filter((p) => now - t(p.createdAt) > 2 * DAY);
  const badResellers = resellerRows.filter((r) => (r.delivered + r.returned) >= 5 && (r.deliveryRate ?? 100) < 70);
  const emptyCats = cats.filter((c) => !products.some((p) => p.status === "active" && (p.categoryId === c.id || p.extraCats?.includes(c.id) || cats.some((s) => s.parentId === c.id && p.categoryId === s.id))));
  const lowMargin = active.filter((p) => { const c = p.basePrices?.[0], pr = p.tiers?.[0]?.price; return c && pr && (pr - c) / pr < 0.05; });
  const neverSold = active.filter((p) => !soldIds.has(p.id) && now - t(p.createdAt) > 30 * DAY);
  const pendingResellers = resellers.filter((r) => r.status === "pending").length;
  const pendingMerchants = merchants.filter((m) => m.status === "pending").length;
  const retRate = (() => { const d = rorders.filter((o) => o.status === "delivered").length, r = rorders.filter((o) => o.status === "returned").length; return d + r >= 5 ? r0((r / (d + r)) * 100) : null; })();
  const cancelRate = oIn.length >= 5 ? r0((oIn.filter((o) => o.status === "cancelled").length / oIn.length) * 100) : null;

  if (stuckNew) issues.push({ level: "critical", title: `${stuckNew} طلب جديد عدّى عليه أكتر من يوم`, detail: "اتصل بالعملاء وأكّد أو الغي — التأخير بيرفع المرتجع ويضيّع العميل.", link: "/admin/orders" });
  if (oldPayouts.length) issues.push({ level: "critical", title: `${oldPayouts.length} طلب سحب للبائعين متأخر`, detail: `إجمالي ${r0(oldPayouts.reduce((a, p) => a + p.amount, 0))} ج.م مستني التحويل من أكتر من يومين — التأخير بيخسّرك ثقة البائعين.`, link: "/admin/resell?tab=payouts" });
  if (noPrice.length) issues.push({ level: "critical", title: `${noPrice.length} منتج منشور من غير سعر صحيح`, detail: "المنتجات دي مش هتتباع وممكن تبوّظ الحسابات. صلّح السعر أو اخفيها.", link: "/admin/products" });
  if (retRate !== null && retRate >= 25) issues.push({ level: "serious", title: `نسبة المرتجع في البيع بالعمولة ${retRate}%`, detail: "عالية — شدّد في تأكيد الطلبات بالتليفون قبل الشحن، وراجع البائعين اللي نسبتهم عالية.", link: "/admin/resell?tab=resellers" });
  if (badResellers.length) issues.push({ level: "serious", title: `${badResellers.length} بائع نسبة التسليم عنده أقل من 70%`, detail: badResellers.slice(0, 5).map((r) => `${r.name} (${r.deliveryRate}%)`).join("، "), link: "/admin/resell?tab=resellers" });
  if (stuckShip) issues.push({ level: "serious", title: `${stuckShip} شحنة عدّى عليها أكتر من أسبوع ومتعلّمتش تسليم أو مرتجع`, detail: "تابعها مع شركة الشحن وحدّث حالتها عشان عمولات البائعين.", link: "/admin/resell?tab=orders" });
  if (cancelRate !== null && cancelRate >= 20) issues.push({ level: "serious", title: `${cancelRate}% من الطلبات آخر ${days} يوم اتلغت`, detail: "شوف أسباب الإلغاء: سعر الشحن؟ التوفر؟ التأخير في التأكيد؟", link: "/admin/orders" });
  if (pend.length) issues.push({ level: "warning", title: `${pend.length} منتج مستني المراجعة`, detail: "منتجات مستوردة لسه مش ظاهرة للعملاء.", link: "/admin/products?f=pending" });
  if (pendingResellers + pendingMerchants) issues.push({ level: "warning", title: `${pendingResellers} بائع بالعمولة و${pendingMerchants} تاجر مستنيين الموافقة`, detail: "كل يوم تأخير ممكن يخسّرك بائع أو تاجر.", link: pendingResellers ? "/admin/resell?tab=resellers" : "/admin/merchants" });
  if (noImg.length) issues.push({ level: "warning", title: `${noImg.length} منتج منشور من غير صورة`, detail: "المنتج من غير صورة تقريباً مابيتباعش.", link: "/admin/products" });
  if (lowMargin.length) issues.push({ level: "warning", title: `${lowMargin.length} منتج هامش ربحه أقل من 5%`, detail: lowMargin.slice(0, 5).map((p) => p.name).join("، "), link: "/admin/products" });
  if (emptyCats.length) issues.push({ level: "warning", title: `${emptyCats.length} قسم فاضي من المنتجات`, detail: emptyCats.map((c) => c.name).join("، "), link: "/admin/categories" });
  if (neverSold.length > 20) issues.push({ level: "warning", title: `${neverSold.length} منتج عدّى عليه شهر من غير ولا طلب`, detail: "جرّب عروض عليهم، أو حسّن الصور والأوصاف، أو اخفي الضعيف منهم.", link: "/admin/enhance" });
  if (oos.length) issues.push({ level: "warning", title: `${oos.length} منتج خلصان عند المورد`, detail: "مخفيين تلقائياً — دوّر على بديل للأكثر طلباً.", link: "/admin/products" });

  const pct = (a: number, b: number) => (b > 0 ? r0(((a - b) / b) * 100) : null);
  return {
    at: now, days,
    kpis: {
      gmv: r0(gmv(oIn)), gmvPrev: r0(gmv(oPrev)), gmvChange: pct(gmv(oIn), gmv(oPrev)),
      orders: oIn.length, ordersPrev: oPrev.length, aov: oIn.filter((o) => live(o.status)).length ? r0(gmv(oIn) / oIn.filter((o) => live(o.status)).length) : 0,
      resellGmv: r0(rgmv(rIn)), resellGmvPrev: r0(rgmv(rPrev)), resellChange: pct(rgmv(rIn), rgmv(rPrev)), resellOrders: rIn.length,
      margin: r0(margin), marginPct: marginBase ? r0((margin / marginBase) * 100) : null,
      commissionsDue: r0(allW.available + allW.pending + allW.requested), commissionsAvailable: allW.available, commissionsPending: allW.pending, payoutsOpen: r0(allW.requested), payoutsPaid: r0(allW.paid),
      users: realUsers.length, newUsers: realUsers.filter((u) => u.createdAt >= from).length, activeUsers: realUsers.filter((u) => u.lastLoginAt >= from).length, buyers, repeatBuyers: repeat,
      products: products.length, activeProducts: active.length, pendingProducts: pend.length, hiddenProducts: products.filter((p) => p.status === "hidden").length,
      merchants: merchants.length, merchantsApproved: merchants.filter((m) => m.status === "approved").length, merchantsPending: pendingMerchants,
      resellers: resellers.length, resellersApproved: resellers.filter((r) => r.status === "approved").length, resellersPending: pendingResellers,
      openRfqs: rfqs.filter((r) => r.status === "open").length, returnRate: retRate, cancelRate, usersListed: users.length > 0,
    },
    daily: Object.values(daily).map((x) => ({ ...x, gmv: r0(x.gmv), rgmv: r0(x.rgmv), requested: r0(x.requested), done: r0(x.done) })),
    flow: { ...flow, doneChange: pct(flow.done.value, flow.done.prev), requestedChange: pct(flow.requested.value, flow.requested.prev) }, pipeline, recent,
    status: {
      orders: Object.entries(orders.reduce((a, o) => ({ ...a, [o.status]: (a[o.status] || 0) + 1 }), {} as Record<string, number>)),
      rorders: Object.entries(rorders.reduce((a, o) => ({ ...a, [o.status]: (a[o.status] || 0) + 1 }), {} as Record<string, number>)),
    },
    topProducts: Object.values(prod).sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((x) => ({ ...x, revenue: r0(x.revenue) })),
    topCategories: Object.values(catAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((x) => ({ ...x, revenue: r0(x.revenue) })),
    governorates: Object.values(govAgg).sort((a, b) => b.orders - a.orders).slice(0, 12).map((x) => ({ ...x, revenue: r0(x.revenue) })),
    resellers: resellerRows, merchants: merchantRows, users: userRows,
    issues,
    catalog: { categories: cats.length, neverSold: neverSold.length, noImage: noImg.length, outOfStock: oos.length, lowMargin: lowMargin.length },
  };
}

/** Only aggregated, non-personal numbers for the AI advisor. */
export function aiBrief(x: Insights) {
  return {
    days: x.days, ordersFlow: x.flow, pipeline: x.pipeline, note: "requested = طلبات اتعملت، done = اتسلّمت فعلاً (دي المبيعات الحقيقية)", kpis: x.kpis, catalog: x.catalog,
    last7days: x.daily.slice(-7), orderStatus: x.status,
    topProducts: x.topProducts.map((p) => ({ name: p.name, qty: p.qty, revenue: p.revenue })),
    topCategories: x.topCategories, governorates: x.governorates.map((g) => ({ name: g.name, orders: g.orders, revenue: g.revenue })),
    resellers: x.resellers.slice(0, 15).map((r, i) => ({ seller: `بائع ${i + 1}`, orders30: r.orders30, deliveryRate: r.deliveryRate, sales: r.sales })),
    merchants: { total: x.kpis.merchants, active: x.merchants.filter((m) => m.activeProducts > 0).length },
    detectedIssues: x.issues.map((i) => i.title),
  };
}
