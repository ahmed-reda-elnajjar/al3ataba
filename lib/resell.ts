/* Selling on commission ("البيع بالعمولة") — shared types + pricing used by BOTH the browser and the server.
 * Customer pays: (our price + reseller's commission) × qty + shipping. Our price = the product's price for that
 * quantity (wholesale tiers) with any live offer applied. The commission is a fixed amount per piece. */
import type { Category, Product, Promo } from "./types";
import { applyPromos } from "./promoCore";
import { priceFor } from "./pricing";

export type ResellSettings = {
  commission: number;                     // default commission per piece (EGP)
  catCommission?: Record<string, number>; // per category (a main category's value covers its subs)
  shipDefault: number;                    // shipping the customer pays when the governorate has no price
  ship?: Record<string, number>;          // shipping per governorate
  holdDays?: number;                      // days after delivery before the commission can be withdrawn
};
export const RESELL_DEFAULT: ResellSettings = { commission: 10, shipDefault: 60, holdDays: 3 };
export const resellSettings = (s?: Partial<ResellSettings> | null): ResellSettings => ({ ...RESELL_DEFAULT, ...(s || {}) });

export type Reseller = {
  id: string; uid: string; name: string; phone: string; governorate: string;
  payMethod: "vcash" | "instapay"; payNumber: string;
  status: "pending" | "approved" | "suspended"; createdAt?: { seconds: number };
};
export type RCustomer = { name: string; phone: string; phone2?: string; governorate: string; address: string; notes?: string };
export type RItem = { productId: string; name: string; image: string; unit: string; qty: number; base: number; commission: number; price: number };
export type RStatus = "new" | "confirmed" | "shipped" | "delivered" | "returned" | "cancelled";
export type ROrder = {
  id: string; resellerId: string; resellerName: string; customer: RCustomer; items: RItem[];
  subtotal: number; shipping: number; total: number; commissionTotal: number;
  status: RStatus; history: { status: RStatus; at: number }[]; deliveredAt?: number | null; createdAt?: { seconds: number };
};
export type Payout = { id: string; resellerId: string; resellerName: string; amount: number; method: string; number: string; status: "requested" | "paid" | "rejected"; createdAt?: { seconds: number }; paidAt?: number | null; note?: string };

export const RSTATUS: Record<RStatus, string> = { new: "جديد", confirmed: "مؤكد", shipped: "تم الشحن", delivered: "تم التسليم", returned: "مرتجع", cancelled: "ملغي" };
export const RSTATUS_TONE: Record<RStatus, string> = { new: "w", confirmed: "v", shipped: "v", delivered: "v", returned: "e", cancelled: "e" };
export const PAYOUT_METHODS = { vcash: "فودافون كاش", instapay: "إنستاباي" } as const;

/** Can the product be sold on commission, and from how many pieces. */
export const canResell = (p: Product) => p.status === "active" && !p.resellOff && (p.tiers?.length ?? 0) > 0;
export const resellMode = (p: Product) => p.resellMode || "both";
export const minQty = (p: Product) => (resellMode(p) === "wholesale" ? Math.max(1, p.moq || 1) : 1);
export const maxQty = (p: Product) => (resellMode(p) === "retail" && p.tiers?.[1]?.min ? Math.max(1, p.tiers[1].min - 1) : 10000);
export const modeLabel = (p: Product) => ({ both: "قطاعي وجملة", retail: "قطاعي بس", wholesale: "جملة بس" })[resellMode(p)];

/** Default commission per piece: product → its category → the main category → site default. */
export function defaultCommission(p: Product, rs: ResellSettings, cats: Category[] = []) {
  if (typeof p.resellCommission === "number" && p.resellCommission >= 0) return p.resellCommission;
  const c = rs.catCommission || {};
  if (typeof c[p.categoryId] === "number") return c[p.categoryId];
  const parent = cats.find((x) => x.id === p.categoryId)?.parentId;
  if (parent && typeof c[parent] === "number") return c[parent];
  return rs.commission;
}

/** Our price per piece for this quantity (wholesale tiers + any live offer — same rule as the normal cart). */
export function baseUnit(p: Product, qty: number, promos: Promo[]) {
  const q = applyPromos(p, promos);
  const tiers = q.promo?.min ? (qty >= q.promo.min && q.promo.tiers?.length ? q.promo.tiers : p.tiers) : q.tiers;
  return priceFor(tiers, qty);
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
export const normPhone = (s: string) => (s || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^0-9]/g, "").replace(/^(?:0020|20)(?=1)/, "0");
