"use client";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { dbI } from "./firebase";
import { listCategories, mixByCategory, pageActiveProducts, sampleCategory } from "./store";
import { priceRange } from "./pricing";
import type { Product } from "./types";

/**
 * Personal recommendations ("مقترح لك").
 * Learns each shopper's interests from what they view, search, favourite and add to cart,
 * then ranks products by category affinity + matching words + usual price range.
 * Kept on the device (localStorage) and, for signed-in users, synced to profiles/{uid}.
 */
export type Interest = { cats: Record<string, number>; words: Record<string, number>; priceSum: number; priceN: number; seen: string[]; t: number };
const K = "al3ataba-interest";
const empty = (): Interest => ({ cats: {}, words: {}, priceSum: 0, priceN: 0, seen: [], t: 0 });
const STOP = new Set(["من", "في", "على", "مع", "و", "ال", "عدد", "قطعة", "قطع", "جديد", "اصلي", "اصلى", "لون", "مقاس", "سعر", "the", "and", "for"]);
const norm = (s: string) => s.toLowerCase().replace(/[ً-ْ]/g, "").replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
export const wordsOf = (s: string) => Array.from(new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))));

export function readInterest(): Interest { try { return { ...empty(), ...JSON.parse(localStorage.getItem(K) || "{}") }; } catch { return empty(); } }
function write(i: Interest) { try { localStorage.setItem(K, JSON.stringify(i)); } catch {} window.dispatchEvent(new Event("interest")); scheduleSync(i); }

// keep the model small: decay old interests and keep only the strongest entries
function prune(m: Record<string, number>, keep: number) {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v * 0.97] as const).filter(([, v]) => v > 0.2).sort((a, b) => b[1] - a[1]).slice(0, keep));
}
const W = { view: 1, fav: 3, cart: 4, search: 2 } as const;

export function track(kind: "view" | "fav" | "cart", p: Pick<Product, "id" | "name" | "categoryId" | "tiers">): void;
export function track(kind: "search", q: string): void;
export function track(kind: keyof typeof W, x: string | Pick<Product, "id" | "name" | "categoryId" | "tiers">) {
  if (typeof window === "undefined") return;
  const i = readInterest(), w = W[kind];
  if (typeof x === "string") { for (const t of wordsOf(x)) i.words[t] = (i.words[t] || 0) + w; }
  else {
    i.cats[x.categoryId] = (i.cats[x.categoryId] || 0) + w;
    for (const t of wordsOf(x.name)) i.words[t] = (i.words[t] || 0) + w * 0.5;
    const pr = x.tiers?.length ? Math.min(...x.tiers.map((t) => t.price)) : 0;
    if (pr > 0) { i.priceSum += Math.log(pr) * w; i.priceN += w; }
    if (kind === "view") i.seen = [x.id, ...i.seen.filter((s) => s !== x.id)].slice(0, 40);
  }
  i.cats = prune(i.cats, 12); i.words = prune(i.words, 60); i.t = Date.now();
  write(i);
}
export const hasInterest = (i = readInterest()) => Object.keys(i.cats).length > 0 || Object.keys(i.words).length > 2;

/** Score = category affinity + matching words + closeness to the shopper's usual price. */
export function score(p: Product, i: Interest) {
  const cat = i.cats[p.categoryId] || 0;
  const words = wordsOf(`${p.name} ${p.categoryName}`).reduce((a, w) => a + (i.words[w] || 0), 0);
  let price = 0;
  if (i.priceN > 0) { const lo = priceRange(p)[0]; if (lo > 0) price = 2 / (1 + Math.abs(Math.log(lo) - i.priceSum / i.priceN)); }
  const seen = i.seen.indexOf(p.id);
  const fresh = seen >= 0 && seen < 3 ? -3 : seen >= 0 ? -0.5 : 0; // don't just show what they opened a minute ago
  return cat * 1.5 + words + price + fresh;
}

/** Products for "مقترح لك": a few reads per favourite category, never the whole catalogue. */
export async function recommend(n = 10, opts: { exclude?: string[]; boostCat?: string } = {}): Promise<Product[]> {
  const i = readInterest();
  if (!hasInterest(i) && !opts.boostCat) return [];
  if (opts.boostCat) i.cats[opts.boostCat] = (i.cats[opts.boostCat] || 0) + 2;
  const ranked = Object.entries(i.cats).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const top = ranked.slice(0, 4);
  const others = (await listCategories().catch(() => [])).map((c) => c.id).filter((c) => !top.includes(c)).slice(0, 6);
  const lists = await Promise.all([
    ...top.map((c) => sampleCategory(c, 10).catch(() => [] as Product[])),
    ...others.map((c) => sampleCategory(c, 3).catch(() => [] as Product[])),
    pageActiveProducts(30).then((r) => r.items).catch(() => [] as Product[]),
  ]);
  const ex = new Set(opts.exclude || []);
  const all = Array.from(new Map(lists.flat().filter((p) => !ex.has(p.id)).map((p) => [p.id, p])).values());
  const sorted = all.map((p) => ({ p, s: score(p, i) })).sort((a, b) => b.s - a.s);
  // variety: at most ~a third of the row from one category, the rest filled from other categories
  const cap = Math.max(2, Math.ceil(n / 3));
  const per: Record<string, number> = {};
  const out: Product[] = [];
  for (const { p, s } of sorted) {
    if (out.length >= n) break;
    if (s <= 0.3 && out.length >= Math.ceil(n / 2)) continue;
    if ((per[p.categoryId] || 0) >= cap) continue;
    per[p.categoryId] = (per[p.categoryId] || 0) + 1; out.push(p);
  }
  if (out.length < n) { // still short: fill with other categories first, then anything
    const rest = sorted.map((x) => x.p).filter((p) => !out.includes(p));
    out.push(...mixByCategory(rest.filter((p) => !per[p.categoryId]), n - out.length));
  }
  return out.slice(0, n);
}

/* ---- sync for signed-in users (profiles/{uid}) ---- */
let uidNow = "";
let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync(i: Interest) {
  if (!uidNow) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { setDoc(doc(dbI(), "profiles", uidNow), { interest: i }, { merge: true }).catch(() => {}); }, 4000);
}
/** Call when the signed-in user changes: merges the cloud profile with this device's history. */
export async function attachUser(uid: string | null) {
  uidNow = uid || "";
  if (!uid) return;
  try {
    const s = await getDoc(doc(dbI(), "profiles", uid));
    const cloud = s.exists() ? (s.data().interest as Interest | undefined) : undefined;
    if (!cloud) { scheduleSync(readInterest()); return; }
    const local = readInterest();
    const mergeMax = (a: Record<string, number>, b: Record<string, number>) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = Math.max(o[k] || 0, v); return o; };
    const merged: Interest = { cats: mergeMax(cloud.cats || {}, local.cats), words: mergeMax(cloud.words || {}, local.words), priceSum: (cloud.priceSum || 0) + local.priceSum, priceN: (cloud.priceN || 0) + local.priceN, seen: Array.from(new Set([...local.seen, ...(cloud.seen || [])])).slice(0, 40), t: Date.now() };
    try { localStorage.setItem(K, JSON.stringify(merged)); } catch {}
    window.dispatchEvent(new Event("interest"));
    scheduleSync(merged);
  } catch { /* offline or rules not published yet: keep local only */ }
}
