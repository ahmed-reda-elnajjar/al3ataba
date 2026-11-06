"use client";
/* Client side of /api/ai-vision: sends small copies of the product photos + video frames to Gemini,
 * then crops the picture it chose (clear product, no text on it) into a square main image. */
import { authI } from "./firebase";

export type Vision = {
  name: string; category: string; description: string; specs: { k: string; v: string }[]; colors: string[];
  best: number[]; boxes: Record<string, [number, number, number, number]>; isProduct: boolean; model?: string;
};

const load = (f: Blob) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });

async function small(f: Blob, max = 640): Promise<string> {
  const im = await load(f); const s = Math.min(1, max / Math.max(im.width, im.height));
  const c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
  c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One product → name, category, description, specs, colours, best pictures. Retries when the free limit is hit. */
export async function analyzeProduct(pics: Blob[], caption: string, categories: string[], hint = ""): Promise<Vision> {
  const u = authI().currentUser; if (!u) throw new Error("سجّل دخول الأول");
  const images = await Promise.all(pics.slice(0, 8).map((p) => small(p)));
  for (let attempt = 0; ; attempt++) {
    const r = await fetch("/api/ai-vision", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-token": await u.getIdToken() }, body: JSON.stringify({ images, caption, categories, hint }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j as Vision;
    const limit = r.status === 429 || r.status === 502 || /quota|limit|exhaust|overload/i.test(String(j.error || ""));
    if (!limit || attempt >= 3) throw new Error(j.error || `HTTP ${r.status}`);
    await sleep(20000 * (attempt + 1)); // free tier: wait and try again
  }
}

/** Square crop around the product box ([ymin,xmin,ymax,xmax] on 0..1000) with a little margin, white outside the photo. */
export async function cropToBox(f: Blob, box?: [number, number, number, number], max = 1200): Promise<File> {
  const im = await load(f); const W = im.width, H = im.height;
  let [y0, x0, y1, x1] = box && box.length === 4 && box[2] > box[0] && box[3] > box[1] ? box.map((v) => Math.max(0, Math.min(1000, v))) : [0, 0, 1000, 1000];
  // too small a box (bad answer) → keep the whole picture
  if ((y1 - y0) < 80 || (x1 - x0) < 80) [y0, x0, y1, x1] = [0, 0, 1000, 1000];
  const bx = (x0 / 1000) * W, by = (y0 / 1000) * H, bw = ((x1 - x0) / 1000) * W, bh = ((y1 - y0) / 1000) * H;
  const side = Math.min(Math.max(W, H), Math.max(bw, bh) * 1.12);
  const cx = bx + bw / 2, cy = by + bh / 2;
  const sx = Math.max(0, Math.min(W - Math.min(W, side), cx - side / 2)), sy = Math.max(0, Math.min(H - Math.min(H, side), cy - side / 2));
  const out = Math.min(max, Math.round(side));
  const c = document.createElement("canvas"); c.width = out; c.height = out;
  const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, out, out);
  const sw = Math.min(W, side), sh = Math.min(H, side), k = out / side;
  g.drawImage(im, sx, sy, sw, sh, (out - sw * k) / 2, (out - sh * k) / 2, sw * k, sh * k);
  const blob = await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/jpeg", 0.92));
  return new File([blob!], "cover.jpg", { type: "image/jpeg" });
}

/** Description + the specs it saw, as one text for the product page. */
export const visionText = (v: Vision) =>
  [v.description.trim(), v.specs.length ? `\nالمواصفات:\n${v.specs.map((s) => `• ${s.k}: ${s.v}`).join("\n")}` : "", v.colors.length ? `\nالألوان المتاحة: ${v.colors.join("، ")}` : ""].join("\n").trim();
