/* Selling on commission ("البيع بالعمولة") — shared types + pricing used by BOTH the browser and the server.
 *
 * Our price to the reseller (per piece):
 *   • wholesale quantity (≥ the product's first wholesale step)  → the normal wholesale price for that quantity
 *   • retail quantity (fewer pieces)                              → wholesale price + retailPct % (default 25%)
 *   • products sold at one price from 1 piece (no wholesale step) → that price
 *   Live offers are applied first (same rule as the normal cart).
 * Reseller's commission (per piece): product override → category override → commissionPct % of our price (default 25%).
 * The reseller can change it per order (any amount ≥ 0).
 * Customer pays: (our price + commission) × qty + shipping for the governorate. */
import type { Category, Product, Promo } from "./types";
import { applyPromos } from "./promoCore";
import { priceFor, sortTiers } from "./pricing";

export type ResellSettings = {
  commissionPct: number;                  // default commission = % of our price per piece
  retailPct: number;                      // retail price = wholesale price + this %
  catCommission?: Record<string, number>; // fixed commission (EGP / piece) per category — a main category's value covers its subs
  shipDefault: number;                    // shipping the customer pays when the governorate has no price
  ship?: Record<string, number>;          // shipping per governorate
  holdDays?: number;                      // days after delivery before the commission can be withdrawn
  commission?: number;                    // (old field, unused)
};
export const RESELL_DEFAULT: ResellSettings = { commissionPct: 25, retailPct: 25, shipDefault: 60, holdDays: 3 };
export function resellSettings(s?: Partial<ResellSettings> | null): ResellSettings {
  const r = { ...RESELL_DEFAULT, ...(s || {}) };
  const n = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : d);
  return { ...r, commissionPct: n(r.commissionPct, 25), retailPct: n(r.retailPct, 25), shipDefault: n(r.shipDefault, 60), holdDays: n(r.holdDays, 3) };
}

export type Reseller = {
  id: string; uid: string; name: string; phone: string; governorate: string;
  payMethod: "vcash" | "instapay"; payNumber: string;
  status: "pending" | "approved" | "suspended"; createdAt?: { seconds: number };
};
export type RCustomer = { name: string; phone: string; phone2?: string; governorate: string; address: string; notes?: string };
export type RItem = { productId: string; name: string; image: string; unit: string; qty: number; retail: boolean; base: number; commission: number; price: number };
export type RStatus = "new" | "confirmed" | "shipped" | "delivered" | "returned" | "cancelled";
export type ROrder = {
  id: string; resellerId: string; resellerName: string; resellerPhone?: string; customer: RCustomer; items: RItem[];
  subtotal: number; shipping: number; total: number; commissionTotal: number;
  status: RStatus; history: { status: RStatus; at: number }[]; deliveredAt?: number | null; createdAt?: { seconds: number };
};
export type Payout = { id: string; resellerId: string; resellerName: string; amount: number; method: string; number: string; status: "requested" | "paid" | "rejected"; createdAt?: { seconds: number }; paidAt?: number | null; note?: string };

export const RSTATUS: Record<RStatus, string> = { new: "جديد", confirmed: "مؤكد", shipped: "تم الشحن", delivered: "تم التسليم", returned: "مرتجع", cancelled: "ملغي" };
export const RSTATUS_TONE: Record<RStatus, string> = { new: "w", confirmed: "v", shipped: "v", delivered: "v", returned: "e", cancelled: "e" };
/** Allowed status moves (admin). */
export const RNEXT: Record<RStatus, RStatus[]> = { new: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered", "returned"], delivered: ["returned"], returned: [], cancelled: ["new"] };
export const PAYOUT_METHODS = { vcash: "فودافون كاش", instapay: "إنستاباي" } as const;

/* ---------- product rules ---------- */
export const canResell = (p: Product) => p.status === "active" && !p.resellOff && (p.tiers?.length ?? 0) > 0;
export const resellMode = (p: Product) => p.resellMode || "both";
/** First wholesale quantity (0 = the product has one price from 1 piece). */
export function wholesaleMin(p: Product) {
  const step = sortTiers(p.tiers || []).find((t) => t.min >= 2)?.min;
  return step ?? ((p.moq || 1) >= 2 ? p.moq : 0);
}
export const minQty = (p: Product) => (resellMode(p) === "wholesale" ? Math.max(1, wholesaleMin(p) || p.moq || 1) : 1);
export const maxQty = (p: Product) => (resellMode(p) === "retail" && wholesaleMin(p) > 1 ? wholesaleMin(p) - 1 : 10000);
export const modeLabel = (p: Product) => ({ both: "قطاعي وجملة", retail: "قطاعي بس", wholesale: "جملة بس" })[resellMode(p)];
export const isRetail = (p: Product, qty: number) => { const w = wholesaleMin(p); return w > 1 && qty < w; };

/** Price tiers after any live offer, for this quantity. */
function offerTiers(p: Product, qty: number, promos: Promo[]) {
  const q = applyPromos(p, promos);
  if (q.promo?.min) return qty >= q.promo.min && q.promo.tiers?.length ? q.promo.tiers : p.tiers;
  return q.tiers;
}
/** Our price per piece to the reseller. */
export function baseUnit(p: Product, qty: number, promos: Promo[], rs: ResellSettings) {
  const tiers = offerTiers(p, qty, promos);
  if (!tiers?.length) return 0;
  const w = wholesaleMin(p);
  if (w > 1 && qty < w) return Math.ceil(priceFor(tiers, w) * (100 + rs.retailPct) / 100); // retail = wholesale + %
  return priceFor(tiers, qty);
}
/** Default commission per piece for this price. */
export function defaultCommission(p: Product, base: number, rs: ResellSettings, cats: Category[] = []) {
  if (typeof p.resellCommission === "number" && p.resellCommission >= 0) return p.resellCommission;
  const c = rs.catCommission || {};
  if (typeof c[p.categoryId] === "number") return c[p.categoryId];
  const parent = cats.find((x) => x.id === p.categoryId)?.parentId;
  if (parent && typeof c[parent] === "number") return c[parent];
  return Math.round(base * rs.commissionPct / 100);
}

export const shipFor = (gov: string, rs: ResellSettings) => (typeof rs.ship?.[gov] === "number" ? rs.ship![gov] : rs.shipDefault);
export const money = (n: number) => Math.round(n * 100) / 100;

/** Wallet from the reseller's orders + payout requests. Delivered → pending for `holdDays`, then available. */
export function wallet(orders: ROrder[], payouts: Payout[], holdDays = 3, now = Date.now()) {
  let pending = 0, earned = 0;
  for (const o of orders) {
    if (o.status !== "delivered" || !o.deliveredAt) continue;
    if (o.deliveredAt + holdDays * 864e5 > now) pending += o.commissionTotal; else earned += o.commissionTotal;
  }
  const paid = payouts.filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0);
  const requested = payouts.filter((p) => p.status === "requested").reduce((a, p) => a + p.amount, 0);
  const expected = orders.filter((o) => ["new", "confirmed", "shipped"].includes(o.status)).reduce((a, o) => a + o.commissionTotal, 0);
  return { pending: money(pending), earned: money(earned), paid: money(paid), requested: money(requested), available: money(Math.max(0, earned - paid - requested)), expected: money(expected) };
}

export const PHONE_RE = /^01[0125]\d{8}$/;
export const normPhone = (s: string) => String(s || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^0-9]/g, "").replace(/^(?:0020|20)(?=1)/, "0");
