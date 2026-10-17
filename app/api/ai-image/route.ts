/* Studio photo for one product (admin only, used from "تحسين الصور والأوصاف" with a preview before saving):
 *  1) reads any text printed on the image (box / catalogue graphics) and turns it into product specs
 *  2) makes a clean studio picture: same product, soft off-white wall + warm beige tabletop, no text/graphics
 *     - first choice: Gemini image model (keeps the product, removes text, builds the scene)
 *     - fallback: Cloudinary composite (product cut out and placed on the same two-tone backdrop)
 * Nothing is saved here — the admin approves each result first. */
import { isAdminToken } from "@/lib/serverAuth";
import { sized } from "@/lib/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || "dvefx5ts8";
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET || "hh3sejta";
const err = (msg: string, status = 500) => Object.assign(new Error(msg), { status });

type Spec = { k: string; v: string };

/* ---------- 1) read the text on the picture ---------- */
const READ_PROMPT = `دي صورة منتج من متجر جملة. اقرأ أي كلام مكتوب على المنتج أو العلبة أو التصميم، واستخرج منه مواصفات المنتج الحقيقية بس (زي: القدرة 30W، نوع الوصلة Type-C إلى Lightning، الطول 1 متر، شحن سريع، رقم الموديل، الماركة، السعة mAh، إصدار البلوتوث...).
- ماتخترعش أي حاجة مش مكتوبة أو واضحة في الصورة.
- اكتب اسم المواصفة بالعربي، والقيمة زي ما هي (الأرقام والأكواد بالإنجليزي).
- تجاهل الشعارات الدعائية والكلام العام.
رجّع JSON فقط: {"hasText": true/false, "specs": [{"k":"...","v":"..."}]}`;

function parseSpecs(t: string): { hasText: boolean; specs: Spec[] } {
  try {
    const m = t.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : t);
    const specs = (Array.isArray(j.specs) ? j.specs : []).filter((s: Spec) => s && s.k && s.v).map((s: Spec) => ({ k: String(s.k).trim().slice(0, 40), v: String(s.v).trim().slice(0, 120) })).slice(0, 12);
    return { hasText: !!j.hasText || specs.length > 0, specs };
  } catch { return { hasText: false, specs: [] }; }
}

async function readText(b64: string): Promise<{ hasText: boolean; specs: Spec[]; by: string }> {
  const e = process.env;
  if (e.GEMINI_API_KEY) {
    for (const model of Array.from(new Set([e.GEMINI_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"]))) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${e.GEMINI_API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: b64 } }, { text: READ_PROMPT }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
        });
        const j = await r.json();
        if (!r.ok) throw err(j?.error?.message || `HTTP ${r.status}`, r.status);
        return { ...parseSpecs(String(j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "")), by: "Gemini" };
      } catch { /* try next */ }
    }
  }
  if (e.GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.GROQ_API_KEY}` },
        body: JSON.stringify({ model: e.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct", temperature: 0.1, messages: [{ role: "user", content: [{ type: "text", text: READ_PROMPT }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }] }),
      });
      const j = await r.json();
      if (r.ok) return { ...parseSpecs(String(j?.choices?.[0]?.message?.content || "")), by: "Groq" };
    } catch { /* ignore */ }
  }
  return { hasText: false, specs: [], by: "" };
}

/* ---------- 2a) Gemini image model ---------- */
const STUDIO_PROMPT = `Edit this product photo into a clean, premium e-commerce studio shot.
Keep the physical product (and its packaging box if it is part of the product) EXACTLY the same: same shape, colours, materials, connectors, buttons, logo printed on the product itself. Do not invent or change any part of the product.
Remove every overlay that is not physically on the product: marketing text, icons, badges, banners, decorative graphics, watermarks, extra background objects.
Place the product centered on a minimalist two-tone studio set: a soft warm off-white wall (#F3F0EA) in the upper part and a smooth warm beige tabletop (#F0DCC4) in the lower part, with a soft natural contact shadow under the product and gentle diffused light. Square 1:1 framing, product filling about 70% of the frame, sharp and high detail. Output only the edited image.`;

async function geminiImage(b64: string): Promise<string | null> {
  const e = process.env;
  if (!e.GEMINI_API_KEY) return null;
  for (const model of Array.from(new Set([e.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image", "gemini-2.0-flash-preview-image-generation"]))) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${e.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: b64 } }, { text: STUDIO_PROMPT }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
      });
      const j = await r.json();
      if (!r.ok) continue;
      const part = (j?.candidates?.[0]?.content?.parts || []).find((p: { inlineData?: { data?: string }; inline_data?: { data?: string } }) => p.inlineData?.data || p.inline_data?.data);
      const data = part?.inlineData?.data || part?.inline_data?.data;
      const mime = part?.inlineData?.mimeType || part?.inline_data?.mime_type || "image/png";
      if (data) return `data:${mime};base64,${data}`;
    } catch { /* next model */ }
  }
  return null;
}

/* ---------- 2b) Cloudinary composite fallback ---------- */
function compositeUrl(src: string) {
  const m = src.match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]+\/)*?v\d+\/(.+?)(\.[a-z0-9]+)?$/i);
  if (!m) return null;
  const id = m[1], ext = m[2] || ".jpg", layer = id.replace(/\//g, ":");
  return `https://res.cloudinary.com/${CLD}/image/upload/c_scale,w_1200,h_1200/e_colorize:100,co_rgb:F3F0EA/l_${layer},c_scale,w_1200,h_520,e_colorize:100,co_rgb:F0DCC4/fl_layer_apply,g_south/l_${layer}/e_background_removal/c_fit,w_900,h_900/e_shadow:40,x_0,y_14/fl_layer_apply,g_center,y_90/q_auto:best/f_jpg/${id}${ext}`;
}

async function upload(file: string) {
  const body = new FormData();
  body.append("file", file); body.append("upload_preset", PRESET); body.append("folder", "al3ataba/studio");
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLD}/image/upload`, { method: "POST", body });
  const j = await r.json();
  if (!j.secure_url) throw err(j?.error?.message || "upload failed");
  return String(j.secure_url).replace("/upload/", "/upload/f_auto,q_auto:best/");
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { url, mode } = (await req.json()) as { url: string; mode?: "auto" | "composite" };
  if (!url || !url.includes("res.cloudinary.com")) return Response.json({ error: "الصورة لازم تكون على Cloudinary" }, { status: 400 });
  try {
    const img = await fetch(sized(url, 1024).replace("f_auto", "f_jpg"));
    if (!img.ok) throw err(`مقدرتش أفتح الصورة (${img.status})`);
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    const [read, gen] = await Promise.all([readText(b64), mode === "composite" ? Promise.resolve(null) : geminiImage(b64)]);
    let image = "", method = "";
    if (gen) { image = await upload(gen); method = "ai"; }
    else {
      const c = compositeUrl(url);
      if (!c) throw err("الصورة مش بصيغة نقدر نعالجها");
      for (let i = 0; i < 4; i++) { const w = await fetch(c, { cache: "no-store" }); if (w.ok) break; await new Promise((r) => setTimeout(r, 3000)); }
      image = await upload(c); method = "studio";
    }
    return Response.json({ image, method, specs: read.specs, hasText: read.hasText, readBy: read.by });
  } catch (e) {
    const x = e as Error & { status?: number };
    return Response.json({ error: String(x.message || e) }, { status: x.status || 500 });
  }
}
