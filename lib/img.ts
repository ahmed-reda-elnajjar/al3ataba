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

// Uploads to Firebase Storage. If Storage is unavailable (e.g. not enabled on the plan),
// falls back to a small inline JPEG so the product can still be saved.
export async function uploadImage(file: File, uid: string, folder: "products" | "merchants" | "rfqs" = "products"): Promise<string> {
  try {
    const blob = await compress(file, 1200, 0.82);
    const r = ref(storageI(), `${folder}/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
    await uploadBytes(r, blob, { contentType: "image/jpeg" });
    return await getDownloadURL(r);
  } catch {
    return toDataUrl(await compress(file, 640, 0.7));
  }
}
