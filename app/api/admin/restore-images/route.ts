/* One-time rescue after the Cloudinary account was disabled: every picture on res.cloudinary.com is dead.
 * Products imported from partner stores (6valley, e.g. alwazeers.com) get their ORIGINAL photos again from the
 * partner and stored on our R2. Others (Telegram / added by hand) are listed so they can be re-uploaded.
 * Call repeatedly (admin page button) — each call does a small batch and says how many are left. */
import { revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog";
import { fetchImage, storeImage } from "@/lib/imgServer";
import { hasR2 } from "@/lib/r2";
import { listSA, patchDocSA } from "@/lib/sa";
import { isAdminToken } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type P = { id: string; name?: string; source?: string; sourceId?: string; categoryId?: string; images?: string[]; media?: string[]; imagesOrig?: string[]; mediaOrig?: string[]; videos?: string[]; imagesLost?: boolean };
type Src = { id: number; images?: unknown; thumbnail?: string };
const dead = (u?: string) => !!u && u.includes("res.cloudinary.com");
const needs = (p: P) => [...(p.images || []), ...(p.media || [])].some(dead);
const arr = <T,>(v: unknown): T[] => { if (Array.isArray(v)) return v as T[]; if (typeof v === "string") { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } } return []; };
function imageUrls(base: string, p: Src) {
  const names = arr<string | { image_name?: string }>(p.images).map((x) => (typeof x === "string" ? x : x.image_name || "")).filter(Boolean);
  const urls = names.map((n) => (/^https?:/.test(n) ? n : `${base}/storage/app/public/product/${n}`));
  if (!urls.length && p.thumbnail) urls.push(/^https?:/.test(p.thumbnail) ? p.thumbnail : `${base}/storage/app/public/product/thumbnail/${p.thumbnail}`);
  return urls.slice(0, 6);
}

/** The partner's whole catalogue ("latest" pages), keyed "host:id". */
async function partner(base: string, deadline: number) {
  const host = new URL(base).host, out = new Map<string, Src>();
  const get = async (page: number) => {
    const r = await fetch(`${base}/api/v1/products/latest?limit=100&offset=${page}&guest_id=1`, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (al3ataba images)" } });
    if (!r.ok) throw new Error(`${host}: HTTP ${r.status}`);
    return r.json() as Promise<{ total_size?: number; products?: Src[] }>;
  };
  const first = await get(1); const total = Number(first.total_size) || 0;
  (first.products || []).forEach((p) => out.set(`${host}:${p.id}`, p));
  for (let page = 2; out.size < total && page <= 60 && Date.now() < deadline; page++) {
    const r = await get(page); if (!r.products?.length) break;
    r.products.forEach((p) => out.set(`${host}:${p.id}`, p));
  }
  return out;
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!hasR2()) return Response.json({ error: "R2 مش متضاف في Vercel (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL)" }, { status: 503 });
  const started = Date.now(), deadline = started + 45_000;
  try {
    const all = await listSA<P>("products", 3000);
    const broken = all.filter(needs);
    const fixable = broken.filter((p) => p.source === "6valley" && p.sourceId && !p.imagesLost);
    const manual = broken.filter((p) => !fixable.includes(p));
    let done = 0; const failed: string[] = [];
    const cats: Record<string, Map<string, Src>> = {};
    for (const p of fixable) {
      if (Date.now() > deadline) break;
      const host = p.sourceId!.split(":")[0], base = `https://${host}`;
      try {
        cats[host] ||= await partner(base, deadline - 10_000);
        const src = cats[host].get(p.sourceId!);
        if (!src) { await patchDocSA(`products/${p.id}`, { imagesLost: true }); failed.push(`${p.name} (مش موجود عند المورد)`); continue; }
        const urls: string[] = [];
        for (const u of imageUrls(base, src)) { try { urls.push(await storeImage(await fetchImage(u), "products", "restore")); } catch { /* skip that one */ } }
        if (!urls.length) { await patchDocSA(`products/${p.id}`, { imagesLost: true }); failed.push(`${p.name} (صوره مش متاحة عند المورد)`); continue; }
        await patchDocSA(`products/${p.id}`, { images: urls, media: urls, imagesOrig: urls, mediaOrig: urls, videos: (p.videos || []).filter((v) => !dead(v)), studio: false });
        done++;
      } catch (e) { failed.push(`${p.name}: ${String((e as Error)?.message || e)}`); }
    }
    const left = fixable.length - done - failed.length;

    // categories with a dead picture → the cover of one of their (fixed) products
    let catsFixed = 0;
    if (left <= 0) {
      const fresh = await listSA<P>("products", 3000);
      for (const c of await listSA<{ id: string; image?: string }>("categories", 500)) {
        if (!dead(c.image)) continue;
        const cover = fresh.find((p) => p.categoryId === c.id && p.images?.[0] && !dead(p.images[0]))?.images?.[0] || "";
        await patchDocSA(`categories/${c.id}`, { image: cover }); catsFixed++;
      }
    }
    if (done || catsFixed) revalidateTag(CATALOG_TAG);
    return Response.json({
      done, left: Math.max(0, left), failed, catsFixed, seconds: Math.round((Date.now() - started) / 1000),
      manual: manual.map((p) => ({ id: p.id, name: p.name || p.id })),
    });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
