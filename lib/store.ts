import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { dbI } from "./firebase";
import { DEFAULT_SETTINGS } from "./config";
import { ms } from "./format";
import type { Category, Merchant, Product, Settings } from "./types";
import { catalog } from "./catalogClient";

/** Is the product in this category (its main one or one of its extra ones)? */
export const inCat = (p: Pick<Product, "categoryId" | "extraCats">, cat: string) => p.categoryId === cat || !!p.extraCats?.includes(cat);
/** Products whose EXTRA categories include `cat` (main-category ones come from the normal queries). Equality + array-contains → no index needed. */
async function extraIn(cat: string, n: number): Promise<Product[]> {
  try {
    const s = await getDocs(query(collection(dbI(), "products"), where("status", "==", "active"), where("extraCats", "array-contains", cat), limit(n)));
    return s.docs.map((d) => withId<Product>(d)).filter((p) => p.categoryId !== cat);
  } catch { return []; }
}

export const withId = <T,>(d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as T;
const newest = <T extends { createdAt?: { seconds: number } }>(a: T[]) => [...a].sort((x, y) => ms(y.createdAt) - ms(x.createdAt));

export async function listActiveProducts(): Promise<Product[]> {
  const c = await catalog(); if (c) return c.products;
  const s = await getDocs(query(collection(dbI(), "products"), where("status", "==", "active"), limit(500)));
  return newest(s.docs.map((d) => withId<Product>(d)));
}
export async function getProduct(id: string): Promise<Product | null> {
  const s = await getDoc(doc(dbI(), "products", id));
  return s.exists() ? withId<Product>(s) : null;
}
export async function listMerchantProducts(merchantId: string): Promise<Product[]> {
  const s = await getDocs(query(collection(dbI(), "products"), where("merchantId", "==", merchantId), where("status", "==", "active")));
  return newest(s.docs.map((d) => withId<Product>(d)));
}
export async function listCategories(): Promise<Category[]> {
  const c = await catalog(); if (c?.categories.length) return c.categories;
  const s = await getDocs(collection(dbI(), "categories"));
  return s.docs.map((d) => withId<Category>(d)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function listApprovedMerchants(): Promise<Merchant[]> {
  const c = await catalog(); if (c) return [...c.merchants].sort((a, b) => Number(b.verified) - Number(a.verified));
  const s = await getDocs(query(collection(dbI(), "merchants"), where("status", "==", "approved")));
  return s.docs.map((d) => withId<Merchant>(d)).sort((a, b) => Number(b.verified) - Number(a.verified));
}
export async function getMerchant(id: string): Promise<Merchant | null> {
  const s = await getDoc(doc(dbI(), "merchants", id));
  return s.exists() ? withId<Merchant>(s) : null;
}
export async function getSettings(): Promise<Settings> {
  const c = await catalog(); if (c) return { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(c.settings).filter(([, v]) => v !== undefined && v !== null)) } as Settings;
  try {
    const s = await getDoc(doc(dbI(), "settings", "site"));
    return { ...DEFAULT_SETTINGS, ...(s.exists() ? (s.data() as Partial<Settings>) : {}) };
  } catch { return DEFAULT_SETTINGS; }
}

/* ---------- scalable reads: only fetch what the page shows ---------- */

// The full catalogue is only needed for free-text search; load it at most once per visit.
let allCache: { at: number; p: Promise<Product[]> } | null = null;
export function allActiveProductsCached(): Promise<Product[]> {
  if (!allCache || Date.now() - allCache.at > 10 * 60_000) {
    allCache = { at: Date.now(), p: listActiveProducts().catch((e) => { allCache = null; throw e; }) };
  }
  return allCache.p;
}

const missingIndex = (e: unknown) => {
  const msg = String((e as { message?: string })?.message || "");
  if (msg.includes("index")) console.warn("[al3ataba] Firestore index needed — open this link once to create it:", msg.match(/https:\/\/\S+/)?.[0] || msg);
  return true;
};

export type Cursor = QueryDocumentSnapshot | { offset: number } | null;
export type Page = { items: Product[]; cursor: Cursor; more: boolean };

/** Newest active products, page by page (optionally inside one category). Needs composite indexes (see firestore.indexes.json);
 *  if an index is still missing it falls back to the old "load all" read so the site never breaks. */
export async function pageActiveProducts(size: number, opts: { cat?: string; after?: Cursor } = {}): Promise<Page> {
  const c = await catalog();
  if (c) {
    const list = opts.cat ? c.products.filter((p) => inCat(p, opts.cat!)) : c.products;
    const from = opts.after && "offset" in opts.after ? opts.after.offset : 0;
    return { items: list.slice(from, from + size), cursor: { offset: from + size }, more: list.length > from + size };
  }
  const after = opts.after && !("offset" in opts.after) ? opts.after : null;
  const base = [where("status", "==", "active"), ...(opts.cat ? [where("categoryId", "==", opts.cat)] : [])];
  try {
    const q = query(collection(dbI(), "products"), ...base, orderBy("createdAt", "desc"), ...(after ? [startAfter(after)] : []), limit(size + 1));
    const [s, extra] = await Promise.all([getDocs(q), opts.cat && !after ? extraIn(opts.cat, 60) : Promise.resolve([] as Product[])]);
    const docs = s.docs.slice(0, size);
    return { items: [...docs.map((d) => withId<Product>(d)), ...extra], cursor: docs[docs.length - 1] ?? null, more: s.docs.length > size };
  } catch (e) {
    missingIndex(e);
    const all = (await allActiveProductsCached()).filter((p) => !opts.cat || inCat(p, opts.cat));
    return { items: after ? [] : all, cursor: null, more: false };
  }
}

/** A few products from the same category (product page "similar", categories page preview). Equality filters only → no index needed. */
export async function sampleCategory(cat: string, n: number, exclude = ""): Promise<Product[]> {
  const c = await catalog(); if (c) return c.products.filter((p) => inCat(p, cat) && p.id !== exclude).slice(0, n);
  const [s, extra] = await Promise.all([getDocs(query(collection(dbI(), "products"), where("status", "==", "active"), where("categoryId", "==", cat), limit(n + 1))), extraIn(cat, n)]);
  return [...s.docs.map((d) => withId<Product>(d)), ...extra].filter((p) => p.id !== exclude).slice(0, n);
}

/** Specific products by id (favourites), 30 per query. */
export async function productsByIds(ids: string[]): Promise<Product[]> {
  const c = await catalog(); if (c) { const m = new Map(c.products.map((p) => [p.id, p])); return ids.map((id) => m.get(id)).filter(Boolean) as Product[]; }
  const out: Product[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const s = await getDocs(query(collection(dbI(), "products"), where("status", "==", "active"), where(documentId(), "in", ids.slice(i, i + 30))));
    out.push(...s.docs.map((d) => withId<Product>(d)));
  }
  return ids.map((id) => out.find((p) => p.id === id)).filter(Boolean) as Product[];
}

/** Interleave products so no single category dominates a row: round-robin across categories,
 *  keeping each category's own order (e.g. newest first). Categories appear in order of their first item. */
export function mixByCategory(list: Product[], n: number): Product[] {
  const groups = new Map<string, Product[]>();
  for (const p of list) { const k = p.categoryId || "-"; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p); }
  const qs = [...groups.values()];
  const out: Product[] = [];
  for (let round = 0; out.length < n && qs.some((q) => q.length > round); round++)
    for (const q of qs) { if (q[round]) out.push(q[round]); if (out.length >= n) break; }
  return out;
}

/** "وصل حديثاً" with variety: newest products + a couple from every category, mixed so each category gets a turn. */
export async function newArrivalsMixed(n: number, catIds: string[]): Promise<Product[]> {
  const [page, ...samples] = await Promise.all([
    pageActiveProducts(Math.max(30, n * 3)).then((r) => r.items).catch(() => [] as Product[]),
    ...catIds.slice(0, 16).map((c) => sampleCategory(c, 3).catch(() => [] as Product[])),
  ]);
  const uniq = Array.from(new Map([...page, ...newest(samples.flat())].map((p) => [p.id, p])).values());
  return mixByCategory(newest(uniq), n);
}
