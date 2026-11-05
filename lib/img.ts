import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { authI, storageI } from "./firebase";

/* Pictures and videos live on our own Cloudflare R2 storage (see lib/r2.ts / app/api/upload).
 * Every picture is stored once in two sizes, so viewing costs nothing extra — no monthly credits to run out
 * (that's what took the old Cloudinary account down). */

async function compress(file: Blob, max: number, q: number): Promise<Blob> {
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

async function token() {
  const u = authI().currentUser;
  if (!u) throw new Error("لازم تسجّل دخول");
  return u.getIdToken();
}
async function api(body: FormData | object, ms = 60000): Promise<string> {
  const isForm = body instanceof FormData;
  const r = await withTimeout(fetch("/api/upload", {
    method: "POST", body: isForm ? body : JSON.stringify(body),
    headers: { "x-firebase-token": await token(), ...(isForm ? {} : { "Content-Type": "application/json" }) },
  }), ms);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || `رفع الصورة فشل (${r.status})`);
  return String(j.url);
}

let storageDown = false; // after one failure, skip Firebase Storage for the rest of the session

/** Our storage (R2) → Firebase Storage → small inline picture as the very last resort. */
export async function uploadImage(file: File, uid: string, folder: "products" | "merchants" | "rfqs" | "categories" | "promos" | "site" = "products"): Promise<string> {
  try {
    // the server keeps ≤1600px anyway; shrinking here keeps the upload small (Vercel accepts ≤4.5MB per request)
    const blob = file.size > 3_500_000 || !/^image\/(jpeg|png|webp)$/.test(file.type) ? await compress(file, 2400, 0.9) : file;
    const body = new FormData();
    body.append("file", blob, "photo.jpg"); body.append("folder", folder);
    return await api(body);
  } catch (e) { console.warn("R2 upload failed", e); }
  if (!storageDown) {
    try {
      const blob = await compress(file, 1600, 0.88);
      const st = storageI();
      st.maxUploadRetryTime = 15000; st.maxOperationRetryTime = 15000;
      const r = ref(st, `${folder}/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
      await withTimeout(uploadBytes(r, blob, { contentType: "image/jpeg" }), 60000);
      return await withTimeout(getDownloadURL(r), 15000);
    } catch { storageDown = true; }
  }
  return toDataUrl(await compress(file, 560, 0.62));
}

export const isLowQuality = (url: string) => url.startsWith("data:");

/** Copy a remote picture (partner store, edited crop) into our storage. Throws if it can't. */
export async function uploadFromUrl(url: string, folder = "imported"): Promise<string> {
  return api({ action: "fetch", url, folder: folder.replace(/^al3ataba\//, "") });
}

/** First frame of a local video file as a JPEG blob (used as its cover). */
async function firstFrame(file: File): Promise<Blob | null> {
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = URL.createObjectURL(file);
    await withTimeout(new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; }), 15000);
    v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    await withTimeout(new Promise((res) => { v.onseeked = res; }), 8000);
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    URL.revokeObjectURL(v.src);
    return await new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.85));
  } catch { return null; }
}

/** Videos go straight from the browser to R2 (too big for a server request). Returns the video URL. */
export async function uploadVideo(file: File): Promise<string> {
  if (file.size > 100_000_000) throw new Error("too-big");
  const r = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-token": await token() }, body: JSON.stringify({ action: "video", type: file.type }) });
  const j = await r.json();
  if (!r.ok || !j.put) throw new Error(j.error || "no-video-host");
  const put = await withTimeout(fetch(j.put, { method: "PUT", body: file, headers: { "Content-Type": file.type || "video/mp4" } }), 300000);
  if (!put.ok) throw new Error(`رفع الفيديو فشل (${put.status})`);
  const frame = await firstFrame(file);
  if (frame) { const f = new FormData(); f.append("file", frame, "poster.jpg"); f.append("posterFor", j.url); await api(f).catch(() => ""); }
  return String(j.url);
}

export const isVideoUrl = (u: string) => /\/video\/upload\//.test(u) || /\/v\/[^?#]+\.(mp4|webm|mov)(\?|#|$)/i.test(u);

/** Cover picture for a video URL. */
export const videoPoster = (url: string) => /\/video\/upload\//.test(url)
  ? url.replace("/upload/q_auto/", "/upload/so_0/").replace(/\.[a-z0-9]+$/i, ".jpg")
  : url.replace(/\.(mp4|webm|mov)(\?.*)?$/i, "_p.webp");

/** The `n` sharpest, well-spaced frames of a local video as JPEG files (for products that only have a video). */
export async function bestFrames(file: File, n = 2): Promise<File[]> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = URL.createObjectURL(file);
  try {
    await withTimeout(new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; }), 20000);
    const dur = v.duration && isFinite(v.duration) ? v.duration : 1;
    const W = v.videoWidth, H = v.videoHeight;
    const big = document.createElement("canvas"); big.width = W; big.height = H;
    const sm = document.createElement("canvas"); const sw = 160, sh = Math.max(1, Math.round((H / W) * 160)); sm.width = sw; sm.height = sh;
    const bctx = big.getContext("2d")!, sctx = sm.getContext("2d", { willReadFrequently: true })!;
    const seek = (t: number) => withTimeout(new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = t; }), 8000);
    const shots: { t: number; score: number }[] = [];
    const steps = Math.min(16, Math.max(6, Math.round(dur * 2)));
    for (let i = 0; i < steps; i++) {
      const t = Math.min(dur - 0.05, (dur * (i + 0.5)) / steps);
      await seek(t);
      sctx.drawImage(v, 0, 0, sw, sh);
      const d = sctx.getImageData(0, 0, sw, sh).data;
      // sharpness = variance of a simple Laplacian on the grey image (blurry/moving frames score low)
      const g = new Float32Array(sw * sh);
      for (let p = 0; p < sw * sh; p++) g[p] = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2];
      let sum = 0, sum2 = 0, cnt = 0;
      for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
        const k = y * sw + x, l = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - sw] - g[k + sw];
        sum += l; sum2 += l * l; cnt++;
      }
      shots.push({ t, score: sum2 / cnt - (sum / cnt) ** 2 });
    }
    const gap = Math.max(0.8, dur / (n * 2));
    const pick: number[] = [];
    for (const s of [...shots].sort((a, b) => b.score - a.score)) {
      if (pick.every((t) => Math.abs(t - s.t) >= gap)) pick.push(s.t);
      if (pick.length >= n) break;
    }
    const out: File[] = [];
    for (const t of pick.sort((a, b) => a - b)) {
      await seek(t);
      bctx.drawImage(v, 0, 0, W, H);
      const blob = await new Promise<Blob | null>((res) => big.toBlob((b) => res(b), "image/jpeg", 0.92));
      if (blob) out.push(new File([blob], `frame-${Math.round(t * 10)}.jpg`, { type: "image/jpeg" }));
    }
    return out;
  } catch { return []; } finally { URL.revokeObjectURL(v.src); }
}
