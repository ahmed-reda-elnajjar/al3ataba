/* Uploads to our own storage (Cloudflare R2).
 *  - multipart: file (+ folder, posterFor) → picture stored in 2 sizes
 *  - JSON {action:"fetch", url, folder}     → copy a remote picture (partner store, AI result)
 *  - JSON {action:"video", type}            → signed URL; the browser PUTs the video straight to R2
 *  - JSON {action:"studio", url}            → white-square studio version (admin)
 * Auth: Firebase ID token in "x-firebase-token" (signed-in, not anonymous). */
import { fetchImage, storeImage, studioImage } from "@/lib/imgServer";
import { hasR2, r2PresignPut, r2Put, rid } from "@/lib/r2";
import { isAdminToken, userFromToken } from "@/lib/serverAuth";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const FOLDERS = new Set(["products", "merchants", "rfqs", "imported", "studio", "categories", "promos", "site"]);
const folderOf = (f: unknown) => (FOLDERS.has(String(f)) ? String(f) : "products");

export async function POST(req: Request) {
  if (!hasR2()) return Response.json({ error: "R2 مش متضاف في Vercel" }, { status: 503 });
  const token = req.headers.get("x-firebase-token") || "";
  const user = await userFromToken(token);
  if (!user) return Response.json({ error: "لازم تسجّل دخول" }, { status: 401 });
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) return Response.json({ error: "مفيش ملف" }, { status: 400 });
      const buf = Buffer.from(await file.arrayBuffer());
      const posterFor = String(form.get("posterFor") || "");
      if (posterFor) { // first frame of an uploaded video, saved next to it
        const m = posterFor.match(/\/(v\/[^?#]+)\.(mp4|webm|mov)$/i);
        if (!m) return Response.json({ error: "فيديو مش معروف" }, { status: 400 });
        const jpg = await sharp(buf).resize(1280, 1280, { fit: "inside" }).webp({ quality: 80 }).toBuffer();
        return Response.json({ url: await r2Put(`${decodeURIComponent(m[1])}_p.webp`, jpg, "image/webp") });
      }
      return Response.json({ url: await storeImage(buf, folderOf(form.get("folder")), user.uid) });
    }
    const body = (await req.json()) as { action?: string; url?: string; folder?: string; type?: string };
    if (body.action === "fetch" && body.url) return Response.json({ url: await storeImage(await fetchImage(body.url), folderOf(body.folder || "imported"), user.uid) });
    if (body.action === "studio" && body.url) {
      if (!(await isAdminToken(token))) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json({ url: await studioImage(await fetchImage(body.url), user.uid) });
    }
    if (body.action === "video") {
      const ext = /webm/.test(String(body.type)) ? "webm" : /quicktime|mov/.test(String(body.type)) ? "mov" : "mp4";
      return Response.json(r2PresignPut(`v/${user.uid.replace(/[^a-z0-9]/gi, "").slice(0, 40)}/${rid()}.${ext}`));
    }
    return Response.json({ error: "طلب مش مفهوم" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
