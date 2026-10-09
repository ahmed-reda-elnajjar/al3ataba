import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { dbI } from "./firebase";
import { DEFAULT_SETTINGS } from "./config";
import { ms } from "./format";
import type { Category, Merchant, Product, Settings } from "./types";

export const withId = <T,>(d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as T;
const newest = <T extends { createdAt?: { seconds: number } }>(a: T[]) => [...a].sort((x, y) => ms(y.createdAt) - ms(x.createdAt));

export async function listActiveProducts(): Promise<Product[]> {
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
  const s = await getDocs(collection(dbI(), "categories"));
  return s.docs.map((d) => withId<Category>(d)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function listApprovedMerchants(): Promise<Merchant[]> {
  const s = await getDocs(query(collection(dbI(), "merchants"), where("status", "==", "approved")));
  return s.docs.map((d) => withId<Merchant>(d)).sort((a, b) => Number(b.verified) - Number(a.verified));
}
export async function getMerchant(id: string): Promise<Merchant | null> {
  const s = await getDoc(doc(dbI(), "merchants", id));
  return s.exists() ? withId<Merchant>(s) : null;
}
export async function getSettings(): Promise<Settings> {
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

export type Page = { items: Product[]; cursor: QueryDocumentSnapshot | null; more: boolean };

/** Newest active products, page by page (optionally inside one category). Needs composite indexes (see firestore.indexes.json);
 *  if an index is still missing it falls back to the old "load all" read so the site never breaks. */
export async function pageActiveProducts(size: number, opts: { cat?: string; after?: QueryDocumentSnapshot | null } = {}): Promise<Page> {
  const base = [where("status", "==", "active"), ...(opts.cat ? [where("categoryId", "==", opts.cat)] : [])];
  try {
    const q = query(collection(dbI(), "products"), ...base, orderBy("createdAt", "desc"), ...(opts.after ? [startAfter(opts.after)] : []), limit(size + 1));
    const s = await getDocs(q);
    const docs = s.docs.slice(0, size);
    return { items: docs.map((d) => withId<Product>(d)), cursor: docs[docs.length - 1] ?? null, more: s.docs.length > size };
  } catch (e) {
    missingIndex(e);
    const all = (await allActiveProductsCached()).filter((p) => !opts.cat || p.categoryId === opts.cat);
    return { items: opts.after ? [] : all, cursor: null, more: false };
  }
}

/** A few products from the same category (product page "similar", categories page preview). Equality filters only → no index needed. */
export async function sampleCategory(cat: string, n: number, exclude = ""): Promise<Product[]> {
  const s = await getDocs(query(collection(dbI(), "products"), where("status", "==", "active"), where("categoryId", "==", cat), limit(n + 1)));
  return s.docs.map((d) => withId<Product>(d)).filter((p) => p.id !== exclude).slice(0, n);
}

/** Specific products by id (favourites), 30 per query. */
export async function productsByIds(ids: string[]): Promise<Product[]> {
  const out: Product[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const s = await getDocs(query(collection(dbI(), "products"), where("status", "==", "active"), where(documentId(), "in", ids.slice(i, i + 30))));
    out.push(...s.docs.map((d) => withId<Product>(d)));
  }
  return ids.map((id) => out.find((p) => p.id === id)).filter(Boolean) as Product[];
}
