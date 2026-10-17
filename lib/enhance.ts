"use client";
/* Product polish: studio photos (background removed → clean white square, sharper, better quality)
 * and professional AI copy. Originals are always kept (imagesOrig / nameOrig / descriptionOrig) so it can be undone. */
import { doc, updateDoc, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { dbI } from "./firebase";
import { uploadFromUrl } from "./img";
import type { Product } from "./types";

const CLOUD = "res.cloudinary.com/dvefx5ts8/";
// "clean": square on white + clearer + better quality, the picture itself is untouched (safe for designed/branded images)
const CLEAN = "c_pad,w_1200,h_1200,b_rgb:FFFFFF/e_improve/e_sharpen:50/q_auto:best/f_jpg";
// "cutout": also removes the background — only good for plain photos; it smears text/graphics on designed images
const CUTOUT = "e_background_removal/" + CLEAN;
export const isStudio = (u: string) => u.includes("/al3ataba/studio/");
const isVideo = (u: string) => u.includes("/video/upload/");

/** Cloudinary URL that renders the studio version of an uploaded image. */
export function studioSource(url: string, cutout = false) {
  return url.replace(/\/image\/upload\/(?:[^/]+\/)*?(v\d+\/)/, `/image/upload/${cutout ? CUTOUT : CLEAN}/$1`);
}

async function warm(url: string, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) return;
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error(r.headers.get("x-cld-error") || `HTTP ${r.status}`);
    } catch (e) { if (i === tries - 1) throw e; }
    await new Promise((res) => setTimeout(res, 4000 * (i + 1)));
  }
  throw new Error("processing timeout");
}

/** One image → studio image stored as its own Cloudinary asset (so resizing later costs nothing extra). */
export async function enhanceImage(url: string, cutout = false): Promise<string> {
  if (!url || isStudio(url) || isVideo(url)) return url;
  let src = url;
  if (!src.includes(CLOUD) || !/\/v\d+\//.test(src)) src = await uploadFromUrl(src); // data: URLs, other hosts → copy to our cloud first
  const s = studioSource(src, cutout);
  await warm(s);                                 // first call does the heavy work (≈10–30s)
  return uploadFromUrl(s, "al3ataba/studio");    // bake the result into a new image
}

export type Opts = { images: "none" | "cover" | "all"; text: boolean; names: boolean; cutout?: boolean };
export type Step = { id: string; name: string; ok: boolean; note: string; before?: string; after?: string };

/** Studio photos for one product. Returns the fields to save (or null if nothing changed). */
export async function enhanceProductImages(p: Product, which: "cover" | "all", cutout = false) {
  const imgs = p.images || [];
  const targets = (which === "cover" ? imgs.slice(0, 1) : imgs).filter((u) => !isStudio(u) && !isVideo(u));
  if (!targets.length) return null;
  const map: Record<string, string> = {};
  for (const u of targets) map[u] = await enhanceImage(u, cutout);
  const swap = (u: string) => map[u] || u;
  return {
    images: imgs.map(swap),
    ...(p.media?.length ? { media: p.media.map(swap) } : {}),
    ...(p.imagesOrig ? {} : { imagesOrig: imgs, ...(p.media?.length ? { mediaOrig: p.media } : {}) }),
    studio: true,
  } as Partial<Product>;
}

/** Configured AI providers (names only). */
export async function listProviders(user: User): Promise<string[]> {
  const r = await fetch("/api/ai-product", { headers: { "x-firebase-token": await user.getIdToken() } }).catch(() => null);
  const j = r?.ok ? await r.json() : {};
  return Array.isArray(j.providers) ? j.providers : [];
}

/** Ask the server to rewrite up to 5 products at once (prefer = provider this worker pins; others are the fallback). */
export async function rewriteText(user: User, list: Product[], names: boolean, prefer?: string) {
  const r = await fetch("/api/ai-product", {
    method: "POST", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() },
    body: JSON.stringify({ names, prefer, items: list.map((p) => ({ id: p.id, name: p.name, category: p.categoryName, description: p.description, specs: (p.specs || []).map((s) => `${s.k}: ${s.v}`).join(" | "), colors: (p.colors || []).join("، "), unit: p.unit, moq: p.moq, packSize: p.packSize })) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return { items: (j.items || []) as { id: string; name: string; description: string }[], provider: String(j.provider || "") };
}

const kw = (name: string, cat: string) => Array.from(new Set(`${name} ${cat}`.toLowerCase().split(/\s+/).filter((w) => w.length > 1)));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs the whole polish in parallel:
 *  - text: one worker per AI provider (Gemini, Groq, Grok, Llama…), all pulling batches from the same queue;
 *    if a provider fails the server falls through to the others, so the batch still gets done
 *  - photos: 3 at a time, at the same time as the text */
export async function enhanceMany(user: User, products: Product[], o: Opts, onStep: (s: Step) => void, stop: () => boolean) {
  const textJob = async () => {
    if (!o.text) return;
    const todo = products.filter((p) => !p.aiCopy);
    const queue: Product[][] = [];
    for (let i = 0; i < todo.length; i += 5) queue.push(todo.slice(i, i + 5));
    if (!queue.length) return;
    const names = await listProviders(user);
    const workers = names.length ? names : [""];
    let broken = false;
    const work = async (prefer: string) => {
      while (queue.length && !stop() && !broken) {
        const batch = queue.shift()!;
        let res: Awaited<ReturnType<typeof rewriteText>> | null = null;
        for (let attempt = 0; attempt < 3 && !res; attempt++) {
          try { res = await rewriteText(user, batch, o.names, prefer || undefined); }
          catch (e) {
            const st = (e as { status?: number }).status, m = String((e as Error).message);
            if (st === 401 || (st === 500 && /مفتاح|API_KEY/.test(m))) { broken = true; batch.forEach((p) => onStep({ id: p.id, name: p.name, ok: false, note: `الوصف: ${m}` })); return; }
            if (attempt < 2) { await sleep(st === 429 ? 65000 : 5000); continue; } // every provider busy → wait a minute
            batch.forEach((p) => onStep({ id: p.id, name: p.name, ok: false, note: st === 429 ? "الوصف: كل المفاتيح وصلت لحدها — هيتعمل في المرة الجاية" : `الوصف: ${m}` }));
          }
        }
        for (const x of res?.items || []) {
          const p = batch.find((b) => b.id === x.id); if (!p) continue;
          const name = (x.name || p.name).slice(0, 90);
          const fields: Partial<Product> = { name, description: x.description, aiCopy: true, reviewed: false, keywords: kw(name, p.categoryName),
            ...(p.nameOrig === undefined ? { nameOrig: p.name, descriptionOrig: p.description || "" } : {}) };
          try { await updateDoc(doc(dbI(), "products", p.id), fields); Object.assign(p, fields); onStep({ id: p.id, name, ok: true, note: `الاسم والوصف اتعادت صياغتهم${res?.provider ? ` (${res.provider})` : ""}` }); }
          catch { onStep({ id: p.id, name: p.name, ok: false, note: "فشل حفظ الوصف" }); }
        }
        await sleep(4000); // each worker paces itself; with N providers that's N× faster overall
      }
    };
    await Promise.all(workers.map(work));
  };

  const imageJob = async () => {
    if (o.images === "none") return;
    const queue = [...products];
    const work = async () => {
      while (queue.length && !stop()) {
        const p = queue.shift()!;
        try {
          const before = p.images?.[0];
          const f = await enhanceProductImages(p, o.images as "cover" | "all", !!o.cutout);
          if (!f) { onStep({ id: p.id, name: p.name, ok: true, note: "الصور متحسنة قبل كده" }); continue; }
          await updateDoc(doc(dbI(), "products", p.id), { ...f, reviewed: false });
          Object.assign(p, f);
          onStep({ id: p.id, name: p.name, ok: true, note: "الصور اتحسنت", before, after: f.images?.[0] });
        } catch (e) { onStep({ id: p.id, name: p.name, ok: false, note: `الصور: ${String((e as Error).message || e)}` }); }
      }
    };
    await Promise.all([work(), work(), work()]);
  };

  await Promise.all([textJob(), imageJob()]);
}

/** Put back the original photos and/or text. */
export async function undoEnhance(p: Product, what: "images" | "text") {
  const f: Record<string, unknown> = {};
  if (what === "images" && p.imagesOrig) Object.assign(f, { images: p.imagesOrig, ...(p.mediaOrig ? { media: p.mediaOrig } : {}), studio: false });
  if (what === "text" && p.nameOrig !== undefined) Object.assign(f, { name: p.nameOrig, description: p.descriptionOrig || "", aiCopy: false });
  if (Object.keys(f).length) await updateDoc(doc(dbI(), "products", p.id), f);
  return f;
}

/** Put back the original photos of many products at once (e.g. after a bad background removal). */
export async function restoreImagesMany(list: Product[], onDone?: (n: number) => void) {
  let n = 0;
  for (let i = 0; i < list.length; i += 400) {
    const b = writeBatch(dbI());
    for (const p of list.slice(i, i + 400)) {
      if (!p.imagesOrig?.length) continue;
      b.update(doc(dbI(), "products", p.id), { images: p.imagesOrig, ...(p.mediaOrig ? { media: p.mediaOrig } : {}), studio: false });
      n++;
    }
    await b.commit();
    onDone?.(n);
  }
  return n;
}

/* ---------- AI studio photo (preview first, then approve) ---------- */
export type StudioResult = { image: string; method: "ai" | "studio"; specs: { k: string; v: string }[]; hasText: boolean; cut?: string };
export async function studioPreview(user: User, url: string, mode: "extract" | "gemini" = "extract", name = "", variant: "auto" | "product" | "boxed" = "auto", prompt = "", bg: "white" | "studio" = "white", hand?: boolean): Promise<StudioResult> {
  const r = await fetch("/api/ai-image", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() }, body: JSON.stringify({ url, mode, name, variant, prompt, bg, hand }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as StudioResult;
}
/** Save an approved studio photo as the cover + merge the specs read from the picture. */
export async function applyStudio(p: Product, res: StudioResult) {
  // the studio photo becomes the main picture; every original photo stays in the gallery after it
  const imgs = (p.images || []).filter((u) => !isStudio(u));
  const images = [res.image, ...imgs];
  const media = p.media?.length ? [res.image, ...p.media.filter((u) => !isStudio(u))] : undefined;
  const have = new Set((p.specs || []).map((s) => s.k.trim()));
  const specs = [...(p.specs || []), ...res.specs.filter((s) => !have.has(s.k.trim()))];
  const f: Partial<Product> = {
    images, ...(media ? { media } : {}), specs, studio: true, reviewed: false,
    ...(res.specs.length ? { aiCopy: false } : {}), // new specs → the next description rewrite will use them
    ...(p.imagesOrig ? {} : { imagesOrig: p.images || [], ...(p.media?.length ? { mediaOrig: p.media } : {}) }),
  };
  await updateDoc(doc(dbI(), "products", p.id), f);
  return f;
}
