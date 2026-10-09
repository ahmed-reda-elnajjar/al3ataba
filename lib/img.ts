import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storageI } from "./firebase";

async function compress(file: File, max: number, q: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", q));
}
const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => rej(f.error); f.readAsDataURL(b); });

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
let storageDown = false; // after one failure, skip Storage for the rest of the session

// Optional free image hosting (Cloudinary, unsigned upload preset). Set both in Vercel → Environment Variables.
const CLD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || "dvefx5ts8";
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET || "hh3sejta";

/** Full-quality pipeline: Cloudinary (if configured) → Firebase Storage → small inline fallback. */
export async function uploadImage(file: File, uid: string, folder: "products" | "merchants" | "rfqs" = "products"): Promise<string> {
  if (CLD && PRESET) {
    try {
      const body = new FormData();
      // keep the original file; only re-encode very large photos (>9MB) at near-original quality
      body.append("file", file.size > 9_000_000 ? await compress(file, 4000, 0.95) : file);
      body.append("upload_preset", PRESET);
      body.append("folder", `al3ataba/${folder}`);
      const r = await withTimeout(fetch(`https://api.cloudinary.com/v1_1/${CLD}/image/upload`, { method: "POST", body }), 60000);
      const j = await r.json();
      if (j.secure_url) return String(j.secure_url).replace("/upload/", "/upload/f_auto,q_auto:best/");
    } catch { /* try next */ }
  }
  if (!storageDown) {
    try {
      const blob = file.size <= 4_500_000 && /^image\/(jpeg|png|webp)$/.test(file.type) ? file : await compress(file, 3000, 0.93);
      const st = storageI();
      st.maxUploadRetryTime = 15000; st.maxOperationRetryTime = 15000;
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const r = ref(st, `${folder}/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
      await withTimeout(uploadBytes(r, blob, { contentType: blob.type || "image/jpeg" }), 60000);
      return await withTimeout(getDownloadURL(r), 15000);
    } catch { storageDown = true; }
  }
  return toDataUrl(await compress(file, 560, 0.62));
}

export const isLowQuality = (url: string) => url.startsWith("data:");

/** Videos go to Cloudinary only (Firestore can't hold them). Returns an optimised MP4 URL. */
export async function uploadVideo(file: File): Promise<string> {
  if (!CLD || !PRESET) throw new Error("no-video-host");
  if (file.size > 100_000_000) throw new Error("too-big");
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", PRESET);
  body.append("folder", "al3ataba/videos");
  const r = await withTimeout(fetch(`https://api.cloudinary.com/v1_1/${CLD}/video/upload`, { method: "POST", body }), 300000);
  const j = await r.json();
  if (!j.secure_url) throw new Error(j.error?.message || "upload");
  return String(j.secure_url).replace("/upload/", "/upload/q_auto/").replace(/\.[a-z0-9]+$/i, ".mp4");
}
/** First-frame poster for a Cloudinary video URL. */
export const videoPoster = (url: string) => url.replace("/upload/q_auto/", "/upload/so_0/").replace(/\.[a-z0-9]+$/i, ".jpg");
