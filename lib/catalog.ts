/* Server-only: ONE cached snapshot of everything the public pages need (products, categories, settings, offers, suppliers).
 * Firebase is read once every few hours (or when the admin changes something) instead of once per visitor,
 * so the free daily read limit isn't eaten by traffic. Only public fields are kept (no supplier costs/links). */
import { unstable_cache } from "next/cache";
import { KEY, ROOT, fromDoc, type V } from "./fsrest";
import type { Category, Merchant, Product, Promo, Settings } from "./types";

export const CATALOG_TAG = "catalog";
export const CATALOG_TTL = 6 * 3600; // seconds — refresh on its own every 6 hours

export type Catalog = { at: number; products: Product[]; categories: Category[]; settings: Partial<Settings>; promos: Promo[]; merchants: Merchant[] };

type Doc = { name: string; fields?: Record<string, V>; updateTime?: string };
// the whole result is cached by unstable_cache below; the raw responses may be too big for the fetch cache (that's fine)
const NOCACHE = { next: { revalidate: 6 * 3600, tags: ["catalog"] } };

async function query(collection: string, filter?: { field: string; value: string }, max = 5000): Promise<Doc[]> {
  const where = filter ? { fieldFilter: { field: { fieldPath: filter.field }, op: "EQUAL", value: { stringValue: filter.value } } } : undefined;
  const r = await fetch(`${ROOT}:runQuery?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, ...NOCACHE,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], ...(where ? { where } : {}), limit: max } }),
  });
  if (!r.ok) throw new Error(`Firestore ${collection}: ${r.status}`);
  const rows: { document?: Doc }[] = await r.json();
  return rows.filter((x) => x.document).map((x) => x.document!);
}
async function one(path: string): Promise<Doc | null> {
  const r = await fetch(`${ROOT}/${path}?key=${KEY}`, NOCACHE);
  return r.ok ? r.json() : null;
}

const small = (u: unknown) => typeof u === "string" && (!u.startsWith("data:") || u.length < 30_000);
const short = (s: unknown, n = 220) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/** Only what product cards, search and filters use. */
function slim(p: Product & { _updated?: string }): Product {
  const images = (p.images || []).filter(small).slice(0, 1);
  const media = (p.media || []).filter(small).slice(0, 1);
  return {
    id: p.id, name: p.name, description: short(p.description, 120), categoryId: p.categoryId, categoryName: p.categoryName,
    ...(p.extraCats?.length ? { extraCats: p.extraCats } : {}),
    unit: p.unit, moq: p.moq, tiers: p.tiers || [], governorate: p.governorate || "",
    merchantId: p.merchantId, merchantName: p.merchantName, ownerUid: "",
    images, ...(media.length ? { media } : {}), specs: [], colors: (p.colors || []).slice(0, 8),
    packSize: p.packSize ?? null, cod: !!p.cod, madeInEgypt: !!p.madeInEgypt, logoPrint: !!p.logoPrint,
    keywords: [], // search already matches name + category
    status: "active", createdAt: p.createdAt,
  } as Product;
}

// the cache keeps items up to 2MB: if we get close, drop the short descriptions (cards don't show them)
function fit(c: Catalog): Catalog {
  if (Buffer.byteLength(JSON.stringify(c)) < 1_800_000) return c;
  return { ...c, products: c.products.map((p) => ({ ...p, description: "" })) };
}

/* ---- Supabase backup copy: every good snapshot is saved there; if Firebase refuses (daily limit reached), we serve the saved copy.
 * Needs SUPABASE_URL + SUPABASE_SERVICE_KEY in Vercel (server only). Without them this part simply does nothing. */
const SB = () => (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY ? { url: process.env.SUPABASE_URL.replace(/\/+$/, ""), key: process.env.SUPABASE_SERVICE_KEY } : null);
async function saveBackup(c: Catalog) {
  const sb = SB(); if (!sb) return;
  await fetch(`${sb.url}/rest/v1/catalog_snapshot?on_conflict=id`, {
    method: "POST", // POST requests are never cached
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, data: c, at: new Date(c.at).toISOString() }),
  }).catch(() => {});
}
async function loadBackup(): Promise<Catalog | null> {
  const sb = SB(); if (!sb) return null;
  const r = await fetch(`${sb.url}/rest/v1/catalog_snapshot?id=eq.1&select=data`, { next: { revalidate: 60 }, headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` } }).catch(() => null);
  const rows = r?.ok ? await r.json() : [];
  return rows?.[0]?.data ?? null;
}

async function build(): Promise<Catalog> {
  try {
    const c = await buildFromFirebase();
    if (c.products.length) await saveBackup(c);
    return c;
  } catch (e) {
    const backup = await loadBackup(); // Firebase out of reads (or down) → last good copy from Supabase
    if (backup) return backup;
    throw e;
  }
}

async function buildFromFirebase(): Promise<Catalog> {
  const [prods, cats, settings, promos, merchants] = await Promise.all([
    query("products", { field: "status", value: "active" }),
    query("categories"),
    one("settings/site"),
    query("promos"),
    query("merchants", { field: "status", value: "approved" }).catch(() => [] as Doc[]),
  ]);
  const s = settings ? fromDoc<Settings>(settings) : ({} as Settings);
  return fit({
    at: Date.now(),
    products: prods.map((d) => slim(fromDoc<Product>(d))).sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
    categories: cats.map((d) => fromDoc<Category>(d)).map(({ id, name, icon, order, image }) => ({ id, name, icon, order, ...(image ? { image } : {}) }) as Category).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    // public settings only (markup rules and supplier import links stay private)
    settings: { shippingPerMerchant: s.shippingPerMerchant, whatsapp: s.whatsapp, supportPhone: s.supportPhone, paymentInstructions: s.paymentInstructions, announcement: s.announcement, heroTitle: s.heroTitle, heroSub: s.heroSub, heroImage: s.heroImage, city: s.city },
    promos: promos.map((d) => { const x = fromDoc<Promo & { _updated?: string }>(d); delete x._updated; return x as Promo; }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    merchants: merchants.map((d) => fromDoc<Merchant>(d)).map((m) => ({ id: m.id, name: m.name, type: m.type, governorate: m.governorate, city: m.city, about: short(m.about, 300), status: m.status, verified: !!m.verified, plan: m.plan, phone: "", ownerUid: "", createdAt: m.createdAt }) as Merchant),
  });
}

/** The cached snapshot (shared by every visitor and every server page). */
export const getCatalog = unstable_cache(build, ["catalog-v1"], { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] });

/** Same, but never throws (pages fall back to their old direct reads when it's null). */
export async function catalogOrNull(): Promise<Catalog | null> {
  try { const c = await getCatalog(); return c.products.length || c.categories.length ? c : null; } catch { return null; }
}
