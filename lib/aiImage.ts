/* Server-only: image *editing/redrawing* (needed for things like "show it from the front").
 * Tries every image-capable key set in Vercel, in order, until one works:
 *   1) Meta Muse Image (muse-image-1.0) (META_API_KEY, or LLAMA_API_KEY) – Meta Model API, dev.meta.ai
 *   2) Google Gemini image model      (GEMINI_API_KEY)        – needs billing on Google AI Studio
 *   3) OpenRouter image models        (OPENROUTER_API_KEY)    – paid credits
 *   4) xAI Grok image editing         (XAI_API_KEY)
 * (Groq keys are text/vision only — they can't output pictures.) */

export type Redraw = { dataUrl: string; by: string };

/** Cloudflare Workers AI — FLUX.2 [klein] image editing. FREE daily allowance (10,000 neurons/day) on any Cloudflare account.
 *  Env: CF_ACCOUNT_ID + CF_API_TOKEN (token with "Workers AI" permission). Input must be under 512×512 → we fetch a 500px copy. */
/** Account ids this Cloudflare token can reach (used when CF_ACCOUNT_ID is wrong or missing). */
export async function cfAccounts(key: string): Promise<{ id: string; name: string }[]> {
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=50", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return Array.isArray(j?.result) ? j.result.map((a: { id: string; name: string }) => ({ id: String(a.id), name: String(a.name || "") })) : [];
  } catch { return []; }
}
export function cfEnv() {
  const rawKey = process.env.CF_API_TOKEN || "", rawAcc = process.env.CF_ACCOUNT_ID || "";
  const key = (rawKey.match(/cfut_[A-Za-z0-9_-]+/) || rawKey.replace(/^.*Bearer\s+/i, "").match(/[A-Za-z0-9_-]{30,}/) || [""])[0];
  const acc = (rawAcc.match(/[a-f0-9]{32}/i) || [""])[0];
  return { rawKey, rawAcc, key, acc };
}
let cfGoodAcc = ""; // the account id that actually worked (cached per server instance)

async function cloudflare(b64: string, prompt: string, fails: string[], small?: string) {
  // tolerate pasted extras: a whole curl line / "Bearer …" for the token, a dashboard URL for the account id
  const { rawKey, rawAcc, key, acc } = cfEnv();
  if (!rawAcc && !rawKey) return null;
  if (!key) { fails.push("Cloudflare: CF_API_TOKEN مش مظبوط"); return null; }
  const model = process.env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";
  try {
    let img: Blob;
    if (small) { const r = await fetch(small); if (!r.ok) throw new Error(`صورة ${r.status}`); img = await r.blob(); }
    else img = new Blob([Buffer.from(b64, "base64")], { type: "image/jpeg" });
    const run = (id: string) => {
      const form = new FormData();
      form.append("prompt", prompt.slice(0, 2000));
      form.append("input_image_0", img, "product.jpg");
      form.append("width", "1024"); form.append("height", "1024");
      return fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    };
    // try the cached/known account first; if the token can't reach it, try every account the token owns
    const tried = new Set<string>();
    let r: Response | null = null, lastErr = "";
    const queue = [cfGoodAcc, acc].filter(Boolean);
    for (let round = 0; round < 2; round++) {
      for (const id of queue) {
        if (tried.has(id)) continue;
        tried.add(id);
        const res = await run(id);
        if (res.ok) { r = res; cfGoodAcc = id; break; }
        const j = await res.json().catch(() => ({}));
        lastErr = String(j?.errors?.[0]?.message || res.status);
        if (!(res.status === 401 || res.status === 403 || /auth/i.test(lastErr))) { round = 2; break; } // a real model error — don't hop accounts
      }
      if (r || round > 0) break;
      queue.push(...(await cfAccounts(key)).map((a) => a.id));
    }
    if (!r) { fails.push(`Cloudflare: ${(acc ? lastErr : lastErr || "CF_ACCOUNT_ID مش مظبوط").slice(0, 90)}`); return null; }
    const ct = r.headers.get("content-type") || "";
    if (ct.startsWith("image/")) return { dataUrl: `data:${ct};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`, by: "Cloudflare (مجاني)" };
    const j = await r.json().catch(() => ({}));
    const out = j?.result?.image || j?.image;
    if (out) return { dataUrl: String(out).startsWith("data:") ? out : `data:image/png;base64,${out}`, by: "Cloudflare (مجاني)" };
    fails.push("Cloudflare: no image");
  } catch (e) { fails.push(`Cloudflare: ${String((e as Error).message).slice(0, 60)}`); }
  return null;
}

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
export async function redraw(b64: string, prompt: string, small?: string): Promise<Redraw> {
  const fails: string[] = [];
  // free first (Cloudflare), then the paid / quota ones
  const cf = await cloudflare(b64, prompt, fails, small);
  if (cf) return cf;
  for (const run of [meta, gemini, openrouter, xai]) {
    const res = await run(b64, prompt, fails);
    if (res) return res;
  }
  const none = !(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) && !process.env.META_API_KEY && !process.env.LLAMA_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.XAI_API_KEY;
  throw Object.assign(new Error(none ? "مفيش مفتاح بيعمل صور (Cloudflare / Meta / Gemini / OpenRouter / Grok)" : `كل مفاتيح الصور رفضت: ${fails.join(" | ")}`), { status: 400 });
}
