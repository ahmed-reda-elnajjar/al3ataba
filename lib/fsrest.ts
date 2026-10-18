/* Server-side, read-only access to the public catalogue through the Firestore REST API (no SDK, no login).
 * Only reads what firestore.rules already allow anyone to read (active products, categories, settings). */
import type { Category, Product } from "./types";

const PROJECT = "al3ataba-c6a08";
const KEY = "AIzaSyCPXarDZxgfjpdxa6MJ8x6o2qlDcxZ-T6A"; // public web key (same as lib/firebase.ts)
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://al3ataba.vercel.app").replace(/\/+$/, "");

type V = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; nullValue?: null; timestampValue?: string; arrayValue?: { values?: V[] }; mapValue?: { fields?: Record<string, V> } };
function val(v: V): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return { seconds: Math.floor(new Date(v.timestampValue).getTime() / 1000) };
  if (v.arrayValue) return (v.arrayValue.values || []).map(val);
  if (v.mapValue) return obj(v.mapValue.fields || {});
  return null;
}
const obj = (f: Record<string, V>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));
const fromDoc = <T,>(d: { name: string; fields?: Record<string, V>; updateTime?: string }) => ({ id: d.name.split("/").pop()!, ...obj(d.fields || {}), _updated: d.updateTime }) as unknown as T & { _updated?: string };

const REV = { next: { revalidate: 3600 } }; // cache for an hour

export async function restProduct(id: string) {
  const r = await fetch(`${ROOT}/products/${encodeURIComponent(id)}?key=${KEY}`, REV).catch(() => null);
  if (!r?.ok) return null;
  const p = fromDoc<Product>(await r.json());
  return p.status === "active" ? p : null;
}
export async function restCategory(id: string) {
  const r = await fetch(`${ROOT}/categories/${encodeURIComponent(id)}?key=${KEY}`, REV).catch(() => null);
  return r?.ok ? fromDoc<Category>(await r.json()) : null;
}
export async function restCategories() {
  const r = await fetch(`${ROOT}/categories?pageSize=300&key=${KEY}`, REV).catch(() => null);
  if (!r?.ok) return [] as (Category & { _updated?: string })[];
  type C = Category & { _updated?: string };
  const docs: { name: string; fields?: Record<string, V>; updateTime?: string }[] = (await r.json()).documents || [];
  return docs.map((d) => fromDoc<Category>(d) as C).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
/** Active products (optionally one category — its main products plus ones that list it in extraCats). Equality / array-contains only → no index needed. */
export async function restProducts(opts: { cat?: string; limit?: number } = {}) {
  const run = async (extra?: { fieldFilter: unknown }) => {
    const filters: unknown[] = [{ fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "active" } } }];
    if (extra) filters.push(extra);
    const body = { structuredQuery: { from: [{ collectionId: "products" }], where: filters.length > 1 ? { compositeFilter: { op: "AND", filters } } : filters[0], limit: opts.limit ?? 2000 } };
    const r = await fetch(`${ROOT}:runQuery?key=${KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...REV }).catch(() => null);
    if (!r?.ok) return [] as (Product & { _updated?: string })[];
    const rows: { document?: { name: string; fields?: Record<string, V>; updateTime?: string } }[] = await r.json();
    return rows.filter((x) => x.document).map((x) => fromDoc<Product>(x.document!));
  };
  if (!opts.cat) return run();
  const [main, more] = await Promise.all([
    run({ fieldFilter: { field: { fieldPath: "categoryId" }, op: "EQUAL", value: { stringValue: opts.cat } } }),
    run({ fieldFilter: { field: { fieldPath: "extraCats" }, op: "ARRAY_CONTAINS", value: { stringValue: opts.cat } } }),
  ]);
  const seen = new Set(main.map((p) => p.id));
  return [...main, ...more.filter((p) => !seen.has(p.id))];
}

export const minPrice = (p: Product) => (p.tiers?.length ? Math.min(...p.tiers.map((t) => t.price)) : 0);
export const firstImage = (p: Product) => (p.images || []).find((u) => !/\/video\/upload\//.test(u)) || "";
export const plain = (s: string, n = 155) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
