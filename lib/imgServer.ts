/* Server-only: turn any picture into our two stored sizes on R2 (no per-view processing later).
 *   main  …/x.webp     longest side ≤ 1600px
 *   thumb …/x_s.webp   longest side ≤ 480px (cards, lists) — lib/media.ts `sized()` picks it */
import sharp from "sharp";
import { r2Put, rid } from "./r2";

const MAX_BYTES = 25_000_000;

/** Download a remote image (partner stores, AI results). Throws on anything that isn't a picture. */
export async function fetchImage(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:image\/[a-z+.-]+;base64,(.+)$/i);
    if (!m) throw new Error("صورة مش مفهومة");
    return Buffer.from(m[1], "base64");
  }
  if (!/^https?:\/\//i.test(url)) throw new Error("رابط مش صالح");
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (al3ataba images)", Accept: "image/*" } });
  if (!r.ok) throw new Error(`الصورة مش موجودة (${r.status})`);
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("الصورة كبيرة جداً");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("الصورة كبيرة جداً");
  return buf;
}

const clean = (s: string) => s.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "x";

/** Store a picture in both sizes. Returns the main URL. */
export async function storeImage(input: Buffer, folder: string, owner = "admin"): Promise<string> {
  const base = `i/${clean(folder)}/${clean(owner)}/${rid()}`;
  const img = sharp(input, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("الملف مش صورة");
  const flat = meta.hasAlpha ? img.flatten({ background: "#ffffff" }) : img;
  const [main, thumb] = await Promise.all([
    flat.clone().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer(),
    flat.clone().resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
  ]);
  const url = await r2Put(`${base}.webp`, main, "image/webp");
  await r2Put(`${base}_s.webp`, thumb, "image/webp");
  return url;
}

/** "Studio" look without any paid service: square, white background, a little sharper and brighter. */
export async function studioImage(input: Buffer, owner = "admin"): Promise<string> {
  const src = sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
  const fitted = await src.resize(1080, 1080, { fit: "inside", withoutEnlargement: false }).toBuffer();
  const square = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#ffffff" } })
    .composite([{ input: fitted, gravity: "center" }])
    .normalise({ lower: 1, upper: 99 }).sharpen({ sigma: 0.8 }).modulate({ brightness: 1.03, saturation: 1.05 })
    .png().toBuffer();
  return storeImage(square, "studio", owner);
}
