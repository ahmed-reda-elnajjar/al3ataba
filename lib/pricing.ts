import type { Product, Tier } from "./types";

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
