/* Looks at a product's photos / video frames (+ the supplier caption) with Gemini vision and returns
 * a clean Arabic name, the best category, a description, the specs it can actually see, the colours,
 * and which picture shows the product most clearly with no text on it (+ the product's box for cropping).
 * Admin only. Uses GEMINI_API_KEY (free tier works: one request per product). */
import { isAdminToken } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type In = { images: string[]; caption?: string; categories?: string[]; hint?: string };
export type VisionOut = {
  name: string; category: string; description: string; specs: { k: string; v: string }[]; colors: string[];
  best: number[]; boxes: Record<string, [number, number, number, number]>; isProduct: boolean;
};

const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

function prompt(caption: string, cats: string[], n: number, hint: string) {
  return `أنت خبير منتجات لمتجر جملة مصري اسمه "العتبة أونلاين". قدامك ${n} صورة لنفس المنتج (صور من المورد ولقطات من فيديو)، مرقمة من 0 لـ ${n - 1} بنفس ترتيب إرسالها.
نص المورد (ممكن يكون فيه سعر وعدد الكرتونة، تجاهلهم): """${caption.slice(0, 1200)}"""
${hint ? `ملاحظة من الإدارة: ${hint}\n` : ""}
المطلوب (بالعربي الفصيح البسيط، من غير مبالغة):
1) name: اسم واضح للمنتج (حتى 70 حرف): نوع المنتج + أهم ميزة/موديل/سعة لو باينة (مثال: "زمزمية حرارية ستانلس 1200 مل بمقبض وشفاط").
2) category: اختار أنسب قسم من القائمة دي بالظبط: ${JSON.stringify(cats)}. لو مفيش ولا قسم مناسب اقترح اسم قسم جديد قصير.
3) description: سطر يعرّف المنتج واستخدامه، ثم 3 لـ 6 نقاط كل نقطة في سطر وتبدأ بـ "• " (المميزات والاستخدامات)، ثم سطر "مناسب لـ: ..." لو مفهوم.
4) specs: المواصفات اللي شايفها فعلاً في الصور أو مكتوبة على العلبة/في النص فقط (الخامة، السعة، المقاس، عدد القطع، الشحن، القدرة...). كل مواصفة {"k":"...","v":"..."}. ممنوع تخمّن.
5) colors: الألوان المتاحة اللي باينة (بالعربي).
6) best: أرقام أحسن صورتين (أو صورة واحدة لو مفيش غيرها) يبان فيهم المنتج بوضوح وكامل، ومن غير كلام مكتوب فوق الصورة أو علامات مائية أو إيد مغطية المنتج.
7) boxes: لكل رقم في best، مربع المنتج في الصورة دي [ymin, xmin, ymax, xmax] من 0 لـ 1000.
8) isProduct: false لو الصور مش لمنتج (آية، إعلان عام، صورة شخصية...).

ممنوع: أسعار، أسماء محلات أو صفحات، أرقام تليفونات، لينكات، إيموجي، وأي معلومة مش متأكد منها.
رجّع JSON فقط بالشكل:
{"name":"","category":"","description":"","specs":[{"k":"","v":""}],"colors":[],"best":[0],"boxes":{"0":[0,0,1000,1000]},"isProduct":true}`;
}

async function toPart(src: string) {
  if (src.startsWith("data:")) {
    const m = src.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error("bad image");
    return { inline_data: { mime_type: m[1], data: m[2] } };
  }
  const r = await fetch(src); if (!r.ok) throw new Error(`image HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  return { inline_data: { mime_type: r.headers.get("content-type")?.split(";")[0] || "image/jpeg", data: b.toString("base64") } };
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: "محتاج GEMINI_API_KEY في Vercel" }, { status: 500 });
  const { images, caption = "", categories = [], hint = "" } = (await req.json()) as In;
  if (!Array.isArray(images) || !images.length || images.length > 8) return Response.json({ error: "bad request" }, { status: 400 });
  let parts: unknown[];
  try { parts = await Promise.all(images.map(toPart)); } catch (e) { return Response.json({ error: String((e as Error).message) }, { status: 400 }); }
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [...parts, { text: prompt(caption, categories.slice(0, 80), images.length, hint) }] }],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
  });
  let last = "";
  // two rounds: "high demand" errors are temporary, so the whole list is tried again after a short wait
  for (const model of [...MODELS, "", ...MODELS]) {
    if (!model) { await new Promise((r) => setTimeout(r, 4000)); continue; }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { last = j?.error?.message || `HTTP ${r.status}`; continue; } // limit reached / model missing → next model
    try {
      const t = String(j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "").replace(/```(?:json)?/g, "");
      const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Partial<VisionOut>;
      const best = (Array.isArray(o.best) ? o.best : []).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < images.length).slice(0, 2);
      const out: VisionOut = {
        name: String(o.name || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim().slice(0, 90),
        category: String(o.category || "").trim(),
        description: String(o.description || "").replace(/https?:\/\/\S+/g, "").trim(),
        specs: (Array.isArray(o.specs) ? o.specs : []).filter((s) => s && s.k && s.v).map((s) => ({ k: String(s.k).slice(0, 40), v: String(s.v).slice(0, 80) })).slice(0, 12),
        colors: (Array.isArray(o.colors) ? o.colors : []).map(String).filter(Boolean).slice(0, 10),
        best: best.length ? best : [0],
        boxes: (o.boxes && typeof o.boxes === "object" ? o.boxes : {}) as VisionOut["boxes"],
        isProduct: o.isProduct !== false,
      };
      return Response.json({ ...out, model });
    } catch { last = "رد مش مفهوم"; }
  }
  return Response.json({ error: `Gemini المجاني مشغول دلوقتي، استنى دقيقة وجرّب تاني. (${(last || "").slice(0, 90)})` }, { status: 502 });
}
