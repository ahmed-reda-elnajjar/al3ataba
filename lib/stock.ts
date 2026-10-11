/* Stock helpers for 6valley stores (alwazeers.com …). Pure functions, used on the server by the daily sync. */
export type SrcStock = { id: number; current_stock?: number | string; product_type?: string; variation?: unknown; published?: number; status?: number; minimum_order_qty?: number | string; min_qty?: number | string };
const arr = <T,>(v: unknown): T[] => { if (Array.isArray(v)) return v as T[]; if (typeof v === "string") { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } } return []; };

/** Pieces in stock, or null when the store doesn't say. */
export function stockOf(p: SrcStock): number | null {
  if (p.product_type === "digital") return null;
  const vs = arr<{ type?: string; qty?: number | string }>(p.variation).filter((v) => v && v.type);
  if (vs.length) return vs.reduce((s, v) => s + Math.max(0, Number(v.qty) || 0), 0);
  return p.current_stock === undefined || p.current_stock === null || p.current_stock === "" ? null : Math.max(0, Number(p.current_stock) || 0);
}

/** Can the product actually be bought? On their site an order below the minimum quantity fails with
 *  "انتهى من المخزن", so a product (or model) whose stock is under its minimum order counts as sold out.
 *  e.g. "شريحه شفاف غوريلا": every model has qty 1 but the minimum order is 10 → sold out. */
export function availability(p: SrcStock): { stock: number | null; moq: number; out: boolean; okTypes: string[] | null } {
  const moq = Math.max(1, Number(p.minimum_order_qty) || Number(p.min_qty) || 1);
  if (p.status === 0) return { stock: 0, moq, out: true, okTypes: [] };
  const vs = arr<{ type?: string; qty?: number | string }>(p.variation).filter((v) => v && v.type);
  const stock = stockOf(p);
  if (vs.length) {
    const ok = vs.filter((v) => (Number(v.qty) || 0) >= moq).map((v) => String(v.type).toLowerCase().replace(/\s+/g, ""));
    return { stock, moq, out: ok.length === 0, okTypes: ok };
  }
  return { stock, moq, out: stock !== null && stock < moq, okTypes: null };
}

/** Reads a whole 6valley catalogue: "latest" pages + every category, de-duplicated. */
export async function fetchCatalogue(base: string, deadline: number) {
  const api = async (path: string) => {
    const r = await fetch(`${base}/api/v1/${path}${path.includes("?") ? "&" : "?"}guest_id=1`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (al3ataba stock sync)" }, cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  };
  const byId = new Map<number, SrcStock>();
  const add = (list: unknown) => { for (const p of arr<SrcStock>(list)) if (p && p.id) byId.set(p.id, p); };
  const first = await api("products/latest?limit=100&offset=1");
  const total = Number(first.total_size) || 0;
  add(first.products);
  for (let page = 2; byId.size < total && page <= 80 && Date.now() < deadline; page++) {
    const r = await api(`products/latest?limit=100&offset=${page}`);
    if (!r.products?.length) break;
    add(r.products);
  }
  type Cat = { id: number; childes?: Cat[] };
  const flat = (cs: Cat[]): Cat[] => cs.flatMap((c) => [c, ...flat(c.childes || [])]);
  const cats = flat(arr<Cat>(await api("categories").catch(() => [])));
  for (let k = 0; k < cats.length && Date.now() < deadline; k += 6) {
    const res = await Promise.all(cats.slice(k, k + 6).map((c) => api(`categories/products/${c.id}`).catch(() => null)));
    for (const r of res) add(Array.isArray(r) ? r : r?.products);
  }
  return { products: [...byId.values()], total, complete: Date.now() < deadline };
}
