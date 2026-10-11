import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { dbI } from "./firebase";
import { withId } from "./store";
import type { CartItem, Product, Promo, Tier } from "./types";
import { priceFor } from "./pricing";

/* ---------- reads / writes ---------- */
let cache: { at: number; p: Promise<Promo[]> } | null = null;
export function listPromos(fresh = false): Promise<Promo[]> {
  if (fresh || !cache || Date.now() - cache.at > 5 * 60_000) {
    cache = {
      at: Date.now(),
      p: getDocs(collection(dbI(), "promos"))
        .then((s) => s.docs.map((d) => withId<Promo>(d)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
        .catch(() => { cache = null; return [] as Promo[]; }),
    };
  }
  return cache.p;
}
export const savePromo = async (id: string | null, data: Omit<Promo, "id">) => {
  cache = null;
  if (id) await updateDoc(doc(dbI(), "promos", id), { ...data, updatedAt: serverTimestamp() });
  else await addDoc(collection(dbI(), "promos"), { ...data, createdAt: serverTimestamp() });
};
export const deletePromo = async (id: string) => { cache = null; await deleteDoc(doc(dbI(), "promos", id)); };

/* ---------- logic ---------- */
const day = (s?: string, end = false) => (s ? new Date(`${s}T${end ? "23:59:59" : "00:00:00"}`).getTime() : NaN);
/** Running now: switched on and inside its date window (dates are optional). */
export function isLive(pr: Promo, now = Date.now()) {
  if (!pr.active || !(pr.value > 0)) return false;
  const a = day(pr.startsAt), b = day(pr.endsAt, true);
  return !(a > now) && !(b < now);
}
export const promoStatus = (pr: Promo): [string, string] => {
  if (!pr.active) return ["متوقف", "g"];
  if (day(pr.startsAt) > Date.now()) return ["لم يبدأ", "w"];
  if (day(pr.endsAt, true) < Date.now()) return ["انتهى", "e"];
  return ["شغال", "v"];
};
export const covers = (pr: Promo, p: Product) =>
  pr.scope === "all" || (pr.scope === "category" ? pr.categoryIds.includes(p.categoryId) : pr.productIds.includes(p.id));

/** Discounted price, rounded to a whole pound, never below 1. */
export const discounted = (price: number, pr: Pick<Promo, "kind" | "value">) =>
  Math.max(1, pr.kind === "percent" ? Math.round(price * (100 - Math.min(pr.value, 95)) / 100) : Math.round(price - pr.value));

export const promoLabel = (pr: Pick<Promo, "kind" | "value"> & { minQty?: number }) =>
  (pr.kind === "percent" ? `خصم ${pr.value}%` : `خصم ${pr.value} ج.م`) + ((pr.minQty ?? 0) > 1 ? ` عند ${pr.minQty} قطع` : "");

/** Returns the product with its best live offer applied to every price tier (original tiers kept in `origTiers`). */
export function applyPromos(p: Product, promos: Promo[]): Product {
  if (!promos.length || !p.tiers?.length || p.promo) return p;
  const base = p.tiers[0].price;
  let best: Promo | undefined;
  for (const pr of promos) if (isLive(pr) && covers(pr, p) && (!best || discounted(base, pr) < discounted(base, best))) best = pr;
  if (!best) return p;
  const tiers: Tier[] = p.tiers.map((t) => ({ ...t, price: discounted(t.price, best!) }));
  const info = { id: best.id, title: best.title, label: promoLabel(best), color: best.color || "" };
  // conditional offer (buy N+ pieces): keep normal prices, carry the discounted tiers for when the condition is met
  if ((best.minQty ?? 0) > 1) return { ...p, promo: { ...info, min: best.minQty, tiers } };
  return { ...p, tiers, origTiers: p.tiers, promo: info };
}

/** Cart fields for a product (normal tiers + the offer's tiers/condition). */
export const cartPromoFields = (p: Product) => p.promo
  ? { promo: p.promo.label, promoId: p.promo.id, ...(p.promo.min ? { promoMin: p.promo.min, promoTiers: p.promo.tiers } : {}) }
  : {};

/** Pieces in the cart that count toward each offer. */
export function offerTotals(items: CartItem[]) {
  const t: Record<string, number> = {};
  for (const i of items) if (i.promoId) t[i.promoId] = (t[i.promoId] || 0) + i.qty;
  return t;
}
/** Re-price cart lines: a conditional offer only kicks in once its pieces (any mix of its products) reach the minimum. */
export function priceCart(items: CartItem[]): CartItem[] {
  const tot = offerTotals(items);
  return items.map((i) => {
    if (!i.promoId || !i.promoMin || !i.tiers?.length || i.fixed) return i;
    const on = (tot[i.promoId] || 0) >= i.promoMin;
    return { ...i, promoOn: on, price: priceFor(on && i.promoTiers?.length ? i.promoTiers : i.tiers, i.qty) };
  });
}

/** Categories that have a live category-wide offer. */
export const promoCats = (promos: Promo[]) => new Set(promos.filter((p) => isLive(p) && p.scope === "category").flatMap((p) => p.categoryIds));

/** Order categories for this shopper: ones with a live offer first, then by their interest, then the admin's order. */
export function personalCatOrder<T extends { id: string; order?: number }>(cats: T[], promos: Promo[], interest: Record<string, number>): T[] {
  const off = promoCats(promos);
  return cats.map((c, i) => ({ c, i })).sort((a, b) =>
    Number(off.has(b.c.id)) - Number(off.has(a.c.id)) || (interest[b.c.id] || 0) - (interest[a.c.id] || 0) || a.i - b.i).map((x) => x.c);
}
