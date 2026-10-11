import type { Product, Tier } from "./types";

export type MarkupTier = { min: number; pct: number };
/** Quantity-based markup: e.g. 1 piece +10%, 5+ pieces +5%. Returns sorted price tiers built on one original price. */
export function tiersFromMarkup(base: number, mt: MarkupTier[]): Tier[] {
  const clean = [...mt].filter((x) => x.min > 0).sort((a, b) => a.min - b.min);
  const out: Tier[] = [];
  for (const x of clean) if (!out.some((t) => t.min === x.min)) out.push({ min: x.min, price: withMarkup(base, x.pct) });
  return out;
}

/** Price bands: "if the original piece price is ≥ from → use these quantity tiers". */
export type PriceRule = { from: number; tiers: MarkupTier[] };
export const DEFAULT_RULES: PriceRule[] = [{ from: 0, tiers: [{ min: 1, pct: 10 }, { min: 5, pct: 5 }] }];
export function pickRule(base: number, rules: PriceRule[]): PriceRule | undefined {
  return [...rules].sort((a, b) => b.from - a.from).find((r) => base >= r.from) ?? rules[0];
}
export function tiersFromRules(base: number, rules: PriceRule[]): { tiers: Tier[]; rule?: PriceRule } {
  const rule = pickRule(base, rules);
  return { tiers: rule ? tiersFromMarkup(base, rule.tiers) : [], rule };
}

/** Price after a % markup, rounded up to a whole pound. */
export const withMarkup = (base: number, pct: number) => Math.ceil(Math.round(base * (100 + (pct || 0))) / 100 - 1e-9); // avoids 100×1.1 = 110.0000001 → 111

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

/* ---------- wholesale quantity steps ----------
 * Once a quantity reaches a wholesale tier it moves in multiples of that tier's minimum:
 * tiers 1 / 5 → 1,2,3,4,5,10,15,20…   tiers 12 / 50 → 12,24,36,48,50,100…  */
const tierAt = (tiers: Tier[], q: number) => { const s = sortTiers(tiers); let t = s[0]; for (const x of s) if (q >= x.min) t = x; return t; };
export function validQty(tiers: Tier[] | undefined, q: number, moq = 1): boolean {
  if (q < Math.max(1, moq)) return false;
  const t = tiers?.length ? tierAt(tiers, q) : undefined;
  return !t || t.min <= 1 || q % t.min === 0;
}
/** Smallest allowed quantity ≥ q. */
export function snapQty(tiers: Tier[] | undefined, q: number, moq = 1): number {
  let x = Math.max(1, moq, Math.floor(q) || 0);
  for (let i = 0; i < 100000 && !validQty(tiers, x, moq); i++) x++;
  return x;
}
export const nextQty = (tiers: Tier[] | undefined, q: number, moq = 1) => snapQty(tiers, q + 1, moq);
export function prevQty(tiers: Tier[] | undefined, q: number, moq = 1): number {
  for (let x = q - 1; x >= Math.max(1, moq); x--) if (validQty(tiers, x, moq)) return x;
  return snapQty(tiers, moq, moq);
}
/** The step size at quantity q (for hints), e.g. 5 inside the "5+" tier. */
export const stepAt = (tiers: Tier[] | undefined, q: number) => { const t = tiers?.length ? tierAt(tiers, q) : undefined; return t && t.min > 1 ? t.min : 1; };
