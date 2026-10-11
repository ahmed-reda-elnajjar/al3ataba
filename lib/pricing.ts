import type { Product, Tier } from "./types";

export type MarkupTier = { min: number; pct: number };
/** Quantity-based markup: e.g. 1 piece +10%, 5+ pieces +5%. Returns sorted price tiers built on one original price. */
export function tiersFromMarkup(base: number, mt: MarkupTier[]): Tier[] {
  const clean = [...mt].filter((x) => x.min > 0).sort((a, b) => a.min - b.min);
  const out: Tier[] = [];
  for (const x of clean) if (!out.some((t) => t.min === x.min)) out.push({ min: x.min, price: withMarkup(base, x.pct) });
  return out;
}

/** Price after a % markup, rounded up to a whole pound. */
export const withMarkup = (base: number, pct: number) => Math.ceil(base * (1 + (pct || 0) / 100));

export const sortTiers = (t: Tier[]) => [...t].sort((a, b) => a.min - b.min);
export function priceFor(tiers: Tier[], qty: number): number {
  const s = sortTiers(tiers);
  let p = s[0]?.price ?? 0;
  for (const t of s) if (qty >= t.min) p = t.price;
  return p;
}
export function priceRange(p: Product): [number, number] {
  const all = p.tiers.map((t) => t.price);
  return all.length ? [Math.min(...all), Math.max(...all)] : [0, 0];
}
export const rangeText = (p: Product) => {
  const [a, b] = priceRange(p);
  return a === b ? `${a}` : `${a} – ${b}`;
};
