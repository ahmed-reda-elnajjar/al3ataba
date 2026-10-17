/* Server-only: image *editing/redrawing* (needed for things like "show it from the front").
 * Tries every image-capable key set in Vercel, in order, until one works:
 *   1) Meta Muse Image (muse-image-1.0) (META_API_KEY, or LLAMA_API_KEY) – Meta Model API, dev.meta.ai
 *   2) Google Gemini image model      (GEMINI_API_KEY)        – needs billing on Google AI Studio
 *   3) OpenRouter image models        (OPENROUTER_API_KEY)    – paid credits
 *   4) xAI Grok image editing         (XAI_API_KEY)
 * (Groq keys are text/vision only — they can't output pictures.) */

export type Redraw = { dataUrl: string; by: string };

async function meta(b64: string, prompt: string, fails: string[]) {
  const key = process.env.META_API_KEY || process.env.LLAMA_API_KEY; if (!key) return null;
  try {
    const r = await fetch("https://api.meta.ai/v1/images/edits", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.META_IMAGE_MODEL || "muse-image-1.0", prompt, images: [{ image_url: `data:image/jpeg;base64,${b64}` }], n: 1 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { fails.push(`Meta: ${String(j?.error?.message || j?.message || j?.error || r.status).slice(0, 90)}`); return null; }
    const d = j?.data?.[0];
    if (d?.b64_json) return { dataUrl: `data:image/${j?.output_format || "png"};base64,${d.b64_json}`, by: "Meta" };
    if (d?.url) return { dataUrl: d.url, by: "Meta" };
    fails.push("Meta: no image");
  } catch (e) { fails.push(`Meta: ${String((e as Error).message).slice(0, 60)}`); }
  return null;
}

async function gemini(b64: string, prompt: string, fails: string[]) {
  const key = process.env.GEMINI_API_KEY; if (!key) return null;
  for (const model of Array.from(new Set([process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image"] ))) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: b64 } }, { text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { fails.push(`Gemini: ${String(j?.error?.message || r.status).slice(0, 90)}`); continue; }
      const part = (j?.candidates?.[0]?.content?.parts || []).find((p: { inlineData?: { data?: string } }) => p.inlineData?.data) as { inlineData: { data: string; mimeType?: string } } | undefined;
      if (part) return { dataUrl: `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`, by: "Gemini" };
      fails.push("Gemini: no image");
    } catch (e) { fails.push(`Gemini: ${String((e as Error).message).slice(0, 60)}`); }
  }
  return null;
}

async function openrouter(b64: string, prompt: string, fails: string[]) {
  const key = process.env.OPENROUTER_API_KEY; if (!key) return null;
  const models = Array.from(new Set([process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-2.5-flash-image-preview:free", "google/gemini-2.5-flash-image-preview", "google/gemini-2.5-flash-image"]));
  for (const model of models) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { fails.push(`OpenRouter ${model.split("/").pop()}: ${String(j?.error?.message || r.status).slice(0, 80)}`); continue; }
      const url = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (url) return { dataUrl: url, by: "OpenRouter" };
      fails.push(`OpenRouter ${model.split("/").pop()}: no image`);
    } catch (e) { fails.push(`OpenRouter: ${String((e as Error).message).slice(0, 60)}`); }
  }
  return null;
}

async function xai(b64: string, prompt: string, fails: string[]) {
  const key = process.env.XAI_API_KEY; if (!key) return null;
  try {
    const r = await fetch("https://api.x.ai/v1/images/edits", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.XAI_IMAGE_MODEL || "grok-imagine-image", prompt, image: { url: `data:image/jpeg;base64,${b64}` }, response_format: "b64_json" }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { fails.push(`Grok: ${String(j?.error?.message || j?.error || r.status).slice(0, 90)}`); return null; }
    const d = j?.data?.[0];
    if (d?.b64_json) return { dataUrl: `data:image/png;base64,${d.b64_json}`, by: "Grok" };
    if (d?.url) return { dataUrl: d.url, by: "Grok" };
    fails.push("Grok: no image");
  } catch (e) { fails.push(`Grok: ${String((e as Error).message).slice(0, 60)}`); }
  return null;
}

/** Returns the edited picture from the first provider that manages it, or throws with every provider's reason. */
export async function redraw(b64: string, prompt: string): Promise<Redraw> {
  const fails: string[] = [];
  for (const run of [meta, gemini, openrouter, xai]) {
    const res = await run(b64, prompt, fails);
    if (res) return res;
  }
  const none = !process.env.META_API_KEY && !process.env.LLAMA_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.XAI_API_KEY;
  throw Object.assign(new Error(none ? "مفيش مفتاح بيعمل صور (Meta / Gemini / OpenRouter / Grok)" : `كل مفاتيح الصور رفضت: ${fails.join(" | ")}`), { status: 400 });
}
