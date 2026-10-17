"use client";
/* Product polish: studio photos (background removed → clean white square, sharper, better quality)
 * and professional AI copy. Originals are always kept (imagesOrig / nameOrig / descriptionOrig) so it can be undone. */
import { doc, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { dbI } from "./firebase";
import { uploadFromUrl } from "./img";
import type { Product } from "./types";

const CLOUD = "res.cloudinary.com/dvefx5ts8/";
const STUDIO = "e_background_removal/c_pad,w_1200,h_1200,b_rgb:FFFFFF/e_improve/e_sharpen:60/q_auto:best/f_jpg";
export const isStudio = (u: string) => u.includes("/al3ataba/studio/");
const isVideo = (u: string) => u.includes("/video/upload/");

/** Cloudinary URL that renders the studio version of an uploaded image. */
export function studioSource(url: string) {
  return url.replace(/\/image\/upload\/(?:[^/]+\/)*?(v\d+\/)/, `/image/upload/${STUDIO}/$1`);
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
export async function enhanceImage(url: string): Promise<string> {
  if (!url || isStudio(url) || isVideo(url)) return url;
  let src = url;
  if (!src.includes(CLOUD) || !/\/v\d+\//.test(src)) src = await uploadFromUrl(src); // data: URLs, other hosts → copy to our cloud first
  const s = studioSource(src);
  await warm(s);                                 // first call does the heavy work (≈10–30s)
  return uploadFromUrl(s, "al3ataba/studio");    // bake the result into a new image
}

export type Opts = { images: "none" | "cover" | "all"; text: boolean; names: boolean };
export type Step = { id: string; name: string; ok: boolean; note: string; before?: string; after?: string };

/** Studio photos for one product. Returns the fields to save (or null if nothing changed). */
export async function enhanceProductImages(p: Product, which: "cover" | "all") {
  const imgs = p.images || [];
  const targets = (which === "cover" ? imgs.slice(0, 1) : imgs).filter((u) => !isStudio(u) && !isVideo(u));
  if (!targets.length) return null;
  const map: Record<string, string> = {};
  for (const u of targets) map[u] = await enhanceImage(u);
  const swap = (u: string) => map[u] || u;
  return {
    images: imgs.map(swap),
    ...(p.media?.length ? { media: p.media.map(swap) } : {}),
    ...(p.imagesOrig ? {} : { imagesOrig: imgs, ...(p.media?.length ? { mediaOrig: p.media } : {}) }),
    studio: true,
  } as Partial<Product>;
}

/** Ask the server to rewrite up to 5 products at once. */
export async function rewriteText(user: User, list: Product[], names: boolean) {
  const r = await fetch("/api/ai-product", {
    method: "POST", headers: { "Content-Type": "application/json", "x-firebase-token": await user.getIdToken() },
    body: JSON.stringify({ names, items: list.map((p) => ({ id: p.id, name: p.name, category: p.categoryName, description: p.description, specs: (p.specs || []).map((s) => `${s.k}: ${s.v}`).join(" | "), colors: (p.colors || []).join("، "), unit: p.unit, moq: p.moq, packSize: p.packSize })) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return (j.items || []) as { id: string; name: string; description: string }[];
}

const kw = (name: string, cat: string) => Array.from(new Set(`${name} ${cat}`.toLowerCase().split(/\s+/).filter((w) => w.length > 1)));

/** Runs the whole polish on a list of products, one by one (text in batches of 5). */
export async function enhanceMany(user: User, products: Product[], o: Opts, onStep: (s: Step) => void, stop: () => boolean) {
  // 1) text, in batches
  if (o.text) {
    const todo = products.filter((p) => !p.aiCopy);
    for (let i = 0; i < todo.length && !stop(); i += 5) {
      const batch = todo.slice(i, i + 5);
      let out: { id: string; name: string; description: string }[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        try { out = await rewriteText(user, batch, o.names); break; }
        catch (e) {
          const st = (e as { status?: number }).status;
          if (st === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, 30000)); continue; }
          batch.forEach((p) => onStep({ id: p.id, name: p.name, ok: false, note: `الوصف: ${String((e as Error).message)}` }));
          if (st === 500 || st === 401) return; // config problem: stop everything
          break;
        }
      }
      for (const x of out) {
        const p = batch.find((b) => b.id === x.id); if (!p) continue;
        const name = (x.name || p.name).slice(0, 90);
        const fields: Partial<Product> = { name, description: x.description, aiCopy: true, reviewed: false, keywords: kw(name, p.categoryName),
          ...(p.nameOrig === undefined ? { nameOrig: p.name, descriptionOrig: p.description || "" } : {}) };
        try { await updateDoc(doc(dbI(), "products", p.id), fields); Object.assign(p, fields); onStep({ id: p.id, name, ok: true, note: "الاسم والوصف اتعادت صياغتهم" }); }
        catch { onStep({ id: p.id, name: p.name, ok: false, note: "فشل حفظ الوصف" }); }
      }
      await new Promise((r) => setTimeout(r, 4000)); // stay inside the free-tier rate limit
    }
  }
  // 2) photos, one product at a time
  if (o.images !== "none") {
    for (const p of products) {
      if (stop()) return;
      try {
        const before = p.images?.[0];
        const f = await enhanceProductImages(p, o.images);
        if (!f) { onStep({ id: p.id, name: p.name, ok: true, note: "الصور متحسنة قبل كده" }); continue; }
        await updateDoc(doc(dbI(), "products", p.id), { ...f, reviewed: false });
        Object.assign(p, f);
        onStep({ id: p.id, name: p.name, ok: true, note: "الصور اتحسنت", before, after: f.images?.[0] });
      } catch (e) { onStep({ id: p.id, name: p.name, ok: false, note: `الصور: ${String((e as Error).message || e)}` }); }
    }
  }
}

/** Put back the original photos and/or text. */
export async function undoEnhance(p: Product, what: "images" | "text") {
  const f: Record<string, unknown> = {};
  if (what === "images" && p.imagesOrig) Object.assign(f, { images: p.imagesOrig, ...(p.mediaOrig ? { media: p.mediaOrig } : {}), studio: false });
  if (what === "text" && p.nameOrig !== undefined) Object.assign(f, { name: p.nameOrig, description: p.descriptionOrig || "", aiCopy: false });
  if (Object.keys(f).length) await updateDoc(doc(dbI(), "products", p.id), f);
  return f;
}
