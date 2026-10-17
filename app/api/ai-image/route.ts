/* Studio photo for one product (admin only, used from "تحسين الصور والأوصاف" with a preview before saving):
 *  1) reads any text printed on the image (box / catalogue graphics) and turns it into product specs
 *  2) makes a clean studio picture: same product, soft off-white wall + warm beige tabletop, no text/graphics
 *     - first choice: Gemini image model (keeps the product, removes text, builds the scene)
 *     - fallback: Cloudinary composite (product cut out and placed on the same two-tone backdrop)
 * Nothing is saved here — the admin approves each result first. */
import { isAdminToken } from "@/lib/serverAuth";
import { sized } from "@/lib/media";
import { redraw } from "@/lib/aiImage";

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
وكمان:
- "subject": وصف إنجليزي قصير (من 2 لـ 5 كلمات) للمنتج كقطعة واحدة زي ما هو ظاهر، من غير الخلفية والرسومات. لو المنتج ظاهر جوه علبته أو العلبة هي الأساس اكتب العلبة (مثال: "retail box with cable"، "wired earphones retail box"، "black over-ear headphones"، "portable bluetooth speaker").
- "boxed": true لو المنتج الأساسي ظاهر جوه علبة أو العلبة واضحة جنبه، وإلا false.
- "parts": كلمات إنجليزي للقطع الحقيقية للمنتج نفسه من غير العلبة (مثال: ["headphones"] أو ["cable","usb plug","connector"]).
- "hand": true لو فيه إيد أو صباع أو جزء من شخص ماسك المنتج أو مغطي جزء منه، وإلا false.
رجّع JSON فقط: {"hasText": true/false, "specs": [{"k":"...","v":"..."}], "subject": "...", "boxed": true/false, "parts": ["..."], "hand": true/false}`;

type Read = { hasText: boolean; specs: Spec[]; parts: string[]; subject: string; boxed: boolean; hand: boolean };
const clean = (x: unknown) => String(x || "").toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
function parseSpecs(t: string): Read {
  try {
    const m = t.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : t);
    const specs = (Array.isArray(j.specs) ? j.specs : []).filter((s: Spec) => s && s.k && s.v).map((s: Spec) => ({ k: String(s.k).trim().slice(0, 40), v: String(s.v).trim().slice(0, 120) })).slice(0, 12);
    const parts = (Array.isArray(j.parts) ? j.parts : []).map(clean).filter(Boolean).slice(0, 4);
    return { hasText: !!j.hasText || specs.length > 0, specs, parts, subject: clean(j.subject).split(" ").slice(0, 6).join(" "), boxed: !!j.boxed, hand: !!j.hand };
  } catch { return { hasText: false, specs: [], parts: [], subject: "", boxed: false, hand: false }; }
}

async function readText(b64: string): Promise<Read & { by: string }> {
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
  return { hasText: false, specs: [], parts: [], subject: "", boxed: false, hand: false, by: "" };
}

/* ---------- 2a) AI redraw (Meta / Gemini / OpenRouter / Grok) ---------- */
// how a realistic catalogue photo of each kind of product should look
const LOOK: [RegExp, string][] = [
  [/كابل|وصلة|وصله|cable|usb|lightning|type.?c|micro/i, "It is a charging/data cable: show the WHOLE cable neatly coiled in a loose round loop (like a real product photo, the coil size suggesting its real length), with BOTH connector ends placed in front of the coil, facing the camera, so each connector's shape (USB-A, Type-C, Lightning, Micro-USB…) is clearly readable. Keep the cable's exact colour, material (braided or smooth) and connector housings."],
  [/شاحن|راس|رأس|charger|adapter|adaptor|wall/i, "It is a charger: show the charger head from the front with its output ports (USB-A / USB-C) clearly visible and the plug prongs visible; if a cable comes with it, show the cable neatly coiled next to the head with its connector end visible."],
  [/باور|power ?bank/i, "It is a power bank: show its front face straight on, with the display/LEDs and the input/output ports clearly visible (slightly show the port edge if needed). Keep its exact colour, finish and printed capacity."],
  [/ايربود|ايربودز|earbud|air ?pod|tws/i, "It is a pair of wireless earbuds: show the charging case open, front view, with both earbuds placed in front of it."],
  [/هاند ?فري|سماعة سلك|سماعه سلك|earphone/i, "It is wired earphones: show both earbuds in front with the cable neatly coiled behind them and the plug/connector clearly visible."],
  [/هيد ?فون|سماعة رأس|سماعه راس|headphone|headset/i, "It is over-ear headphones: show them standing upright, front view, both ear cups visible."],
  [/ساع|watch/i, "It is a smart watch: show the watch face straight on with the strap closed in a loop behind it, screen on."],
  [/جراب|كفر|case|cover/i, "It is a phone case: show the back of the case straight on with the camera cut-out visible."],
  [/سبيكر|صب|speaker/i, "It is a speaker: show its front grille straight on with the control buttons visible."],
];

function buildPrompt(read: Read, name: string, variant: string, extra: string) {
  const hay = `${name} ${read.subject} ${read.parts.join(" ")}`;
  const look = LOOK.find(([re]) => re.test(hay))?.[1] || "Show the complete product, every part of it visible.";
  const facts = read.specs.slice(0, 10).map((s) => `${s.k}: ${s.v}`).join("; ");
  return [
    "Turn this photo into a realistic, premium e-commerce catalogue photo of the SAME product.",
    `Product: ${name}${read.subject ? ` (${read.subject})` : ""}.`,
    facts ? `Facts read from its packaging (use them to get the product right, do not print them as text): ${facts}.` : "",
    "First study the photo carefully and infer every real detail of the product: shape, colours, materials, connectors/ports, buttons, logos physically printed on it, length/size.",
    look,
    variant === "boxed" ? "Place its retail box standing upright behind/next to the product, box front facing the camera." : "Show ONLY the product itself, out of its packaging (no box, no blister, no card).",
    "Camera: straight-on FRONT view at eye level, true-to-life proportions, realistic soft contact shadow under the product.",
    "Background: seamless pure white (#FFFFFF), even diffused studio lighting.",
    "Remove hands, fingers, marketing text, stickers, badges, watermarks and any other objects; reconstruct any hidden part faithfully.",
    "Do NOT invent features, change colours or change the design. Ultra sharp, high resolution, square 1:1, product filling about 75% of the frame.",
    extra ? `Extra instructions from the shop owner (follow them; they may be in Arabic): ${extra}` : "",
    "Output only the final image.",
  ].filter(Boolean).join("\n");
}

async function geminiImage(b64: string, prompt: string): Promise<{ data: string; by: string } | { error: string }> {
  try { const r = await redraw(b64, prompt); return { data: r.dataUrl, by: r.by }; }
  catch (e) { return { error: String((e as Error).message) }; }
}

/* ---------- 2b) Cloudinary: extract just the product (AI), place it on the studio backdrop ---------- */
// what to cut out, guessed from the Arabic name/category when the vision model didn't tell us
const GUESS: [RegExp, string[]][] = [
  [/ايربود|ايربودز|earbud|air ?pod/i, ["wireless earbuds", "charging case"]],
  [/هيد ?فون|سماعة رأس|سماعه راس|headphone|headset/i, ["headphones"]],
  [/هاند ?فري|سماعة سلك|earphone/i, ["earphones", "cable", "plug"]],
  [/صب|سبيكر|speaker/i, ["bluetooth speaker"]],
  [/باور|power ?bank/i, ["power bank"]],
  [/شاحن|charger|adapter/i, ["charger", "power adapter", "cable"]],
  [/كابل|وصلة|cable/i, ["cable", "usb plug", "connector"]],
  [/ساع|watch/i, ["smart watch", "watch strap"]],
  [/استراب|strap|band/i, ["watch strap"]],
  [/جراب|كفر|case|cover/i, ["phone case"]],
  [/سكرين|اسكرينة|شاشة|screen|glass/i, ["screen protector"]],
  [/هولدر|حامل|holder/i, ["phone holder"]],
  [/فستان|بلوز|قميص|بنطلون|جيبة|جيبه|عباية|سويت|هودي|ملابس|توب|كوت|جاكيت|شميز/i, ["clothing", "garment"]],
];
const guessParts = (text: string) => GUESS.find(([re]) => re.test(text))?.[1] || ["product"];

/** bg "white": pure white, product centered with a light shadow · bg "studio": off-white wall + beige tabletop.
 *  hand: first erase hands/fingers and let the AI rebuild the hidden part of the product/box. */
function compositeUrl(src: string, parts: string[], o: { bg: "white" | "studio"; hand: boolean }) {
  const m = src.match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]+\/)*?v\d+\/(.+?)(\.[a-z0-9]+)?$/i);
  if (!m) return null;
  const id = m[1], ext = m[2] || ".jpg", layer = id.replace(/\//g, ":");
  const list = parts.map((p) => encodeURIComponent(p)).join(";");
  const prompt = parts.length > 1 ? `prompt_(${list});multiple_true` : `prompt_${list}`;
  const fix = o.hand ? "e_gen_remove:prompt_(hand;finger;fingers);multiple_true/" : "";
  // high definition: clean compression artefacts (gen_restore) + AI upscale ×4 before cutting out
  const cut = `l_${layer}/c_limit,w_900,h_900/${fix}e_gen_restore/e_upscale/e_extract:${prompt}/e_trim/e_sharpen:30`;
  if (o.bg === "white") // pure white, no shadow, 2000×2000
    return `https://res.cloudinary.com/${CLD}/image/upload/c_scale,w_2000,h_2000/e_colorize:100,co_rgb:FFFFFF/${cut}/c_fit,w_1500,h_1500/fl_layer_apply,g_center/q_auto:best/f_jpg/${id}${ext}`;
  return `https://res.cloudinary.com/${CLD}/image/upload/c_scale,w_1200,h_1200/e_colorize:100,co_rgb:F3F0EA/l_${layer},c_scale,w_1200,h_520,e_colorize:100,co_rgb:F0DCC4/fl_layer_apply,g_south/${cut}/c_fit,w_900,h_800/e_shadow:35,x_0,y_16/fl_layer_apply,g_south,y_150/q_auto:best/f_jpg/${id}${ext}`;
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
  const { url, mode, name, variant, prompt, bg, hand } = (await req.json()) as { url: string; mode?: "gemini" | "extract"; name?: string; variant?: "auto" | "product" | "boxed"; prompt?: string; bg?: "white" | "studio"; hand?: boolean };
  if (!url || !url.includes("res.cloudinary.com")) return Response.json({ error: "الصورة لازم تكون على Cloudinary" }, { status: 400 });
  try {
    const img = await fetch(sized(url, 1024).replace("f_auto", "f_jpg"));
    if (!img.ok) throw err(`مقدرتش أفتح الصورة (${img.status})`);
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    // redraw needs what's written on the product first, so it can draw the right connectors/ports
    const read = await readText(b64);
    const gen = mode === "gemini" ? await geminiImage(b64, buildPrompt(read, name || "", variant || "auto", clean(prompt))) : null;
    let image = "", method = "";
    if (gen && "data" in gen) {
      image = await upload(gen.data); method = "ai";
      // Gemini returns ~1024px: upscale ×4 for a high-definition packshot (keeps the first file if it fails)
      try { const up = image.replace("/upload/f_auto,q_auto:best/", "/upload/e_upscale/q_auto:best/f_jpg/"); if ((await fetch(up, { cache: "no-store" })).ok) image = await upload(up); } catch { /* keep */ }
    }
    else {
      if (mode === "gemini") throw err(`إعادة الرسم مش متاحة: ${gen && "error" in gen ? gen.error : ""}`, 400);
      // what to cut: custom words > chosen variant > the vision model's "subject" (whole item, box included when it's boxed) > guess
      const base = read.parts.length ? read.parts : guessParts(name || "");
      const custom = clean(prompt);
      const what = custom ? [custom]
        : variant === "product" ? base
        : variant === "boxed" ? [`${base[0]} and retail box`]
        : read.subject ? [read.subject] : base;
      const c = compositeUrl(url, what, { bg: bg === "studio" ? "studio" : "white", hand: hand ?? read.hand });
      if (!c) throw err("الصورة مش بصيغة نقدر نعالجها");
      let ok = false, why = "";
      for (let i = 0; i < 4 && !ok; i++) { const w = await fetch(c, { cache: "no-store" }); ok = w.ok; why = w.headers.get("x-cld-error") || String(w.status); if (!ok) await new Promise((r) => setTimeout(r, 4000)); }
      if (!ok) throw err(`Cloudinary: ${why}`);
      image = await upload(c); method = "studio";
    }
    return Response.json({ image, method, specs: read.specs, hasText: read.hasText, readBy: read.by, cut: method === "studio" ? (clean(prompt) || (variant === "product" ? (read.parts.join(", ") || "") : variant === "boxed" ? "product + box" : read.subject)) : "" });
  } catch (e) {
    const x = e as Error & { status?: number };
    return Response.json({ error: String(x.message || e) }, { status: x.status || 500 });
  }
}
