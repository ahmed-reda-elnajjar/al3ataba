/* Rewrites product names/descriptions professionally (admin only).
 * Rotates between every AI key set in Vercel (Gemini, Groq, xAI Grok, Meta Llama, OpenRouter, Claude) so the
 * free daily limits add up: when one provider says "limit reached", the next one takes over. Never invents specs: it only reorganises what we have. */
import { isAdminToken } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type In = { id: string; name: string; category?: string; description?: string; specs?: string; colors?: string; unit?: string; moq?: number; packSize?: number | null };
type Out = { id: string; name: string; description: string };

const clean = (s = "", n = 1500) => s.replace(/https?:\/\/\S+/g, "").replace(/(?:\+?20|0)1[0125]\d{8}/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s{3,}/g, "\n").trim().slice(0, n);

function prompt(items: In[], names: boolean) {
  const data = items.map((p) => ({ id: p.id, name: clean(p.name, 200), category: p.category || "", description: clean(p.description), specs: clean(p.specs || "", 500), colors: p.colors || "", sale_unit: p.unit || "", min_order: p.moq || 1, pieces_per_unit: p.packSize || undefined }));
  return `أنت كاتب محتوى محترف لمتجر جملة مصري اسمه "العتبة أونلاين" (عملاؤه أصحاب محلات وتجار).
أعد صياغة بيانات المنتجات التالية بشكل احترافي وواضح.

القواعد:
- اكتب بعربي فصيح بسيط يفهمه التاجر المصري، بدون مبالغة تسويقية.
- ممنوع تخترع أي معلومة مش موجودة في البيانات (مواصفات، خامة، ضمان، مقاسات، قدرة بطارية...). لو معلومة مش موجودة ماتكتبهاش.
- احتفظ بأكواد الموديلات والماركات والمقاسات كما هي بالحروف الإنجليزية (مثل DC-C212، VOCO، Type-C، 20W).
${names ? `- الاسم: واضح ومختصر (حتى 60 حرف): نوع المنتج + الماركة/الموديل + أهم ميزة. لو الاسم الأصلي مش اسم منتج (زي "بسم الله الرحمن الرحيم" أو جملة دعائية) استنتج اسم مناسب من الوصف والقسم.` : `- الاسم: رجّعه زي ما هو بالظبط.`}
- الوصف: سطر افتتاحي واحد يعرّف المنتج، ثم من 3 إلى 6 نقاط كل نقطة في سطر وتبدأ بـ "• " (المميزات، الاستخدام، التوافق، الألوان المتاحة)، ثم لو مفهوم من البيانات سطر "مناسب لـ: ...".
- لو البيانات قليلة جداً اكتب وصف قصير (سطر + نقطتين) من الاسم والقسم بس، من غير اختراع.
- بدون إيموجي، بدون أسعار، بدون أرقام تليفونات أو لينكات أو أسماء صفحات.

رجّع JSON فقط بالشكل: [{"id":"...","name":"...","description":"..."}] لنفس المنتجات وبنفس الـ id.

المنتجات:
${JSON.stringify(data)}`;
}

function parse(text: string): Out[] {
  const m = text.match(/\[[\s\S]*\]/);
  const arr = JSON.parse(m ? m[0] : text);
  return (Array.isArray(arr) ? arr : []).filter((x) => x && x.id && x.description).map((x) => ({ id: String(x.id), name: String(x.name || "").trim(), description: String(x.description).trim() }));
}

/* ---- providers: every key you add in Vercel is used; when one hits its free limit we move to the next ---- */
type Provider = { name: string; run: (text: string) => Promise<string> };
const err = (msg: string, status: number) => Object.assign(new Error(msg), { status });

async function geminiOne(model: string, text: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json" } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw err(j?.error?.message || `Gemini HTTP ${r.status}`, r.status);
  return String(j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "");
}
/** Any OpenAI-compatible chat API (Groq, xAI Grok, Meta Llama API, OpenRouter…). */
async function openaiLike(url: string, key: string, model: string, text: string, label: string) {
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.4, max_tokens: 4000, messages: [{ role: "system", content: "You output only valid JSON, no markdown." }, { role: "user", content: text }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw err(j?.error?.message || j?.message || `${label} HTTP ${r.status}`, r.status);
  const c = j?.choices?.[0]?.message?.content ?? j?.completion_message?.content?.text ?? j?.completion_message?.content;
  return String(typeof c === "string" ? c : JSON.stringify(c ?? ""));
}
async function claude(text: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5", max_tokens: 4000, messages: [{ role: "user", content: text }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw err(j?.error?.message || `Claude HTTP ${r.status}`, r.status);
  return String(j?.content?.map((c: { text?: string }) => c.text || "").join("") || "");
}

function providers(): Provider[] {
  const e = process.env, list: Provider[] = [];
  if (e.GEMINI_API_KEY) for (const m of Array.from(new Set([e.GEMINI_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"]))) list.push({ name: `Gemini (${m})`, run: (t) => geminiOne(m, t) });
  if (e.GROQ_API_KEY) list.push({ name: "Groq", run: (t) => openaiLike("https://api.groq.com/openai/v1/chat/completions", e.GROQ_API_KEY!, e.GROQ_MODEL || "llama-3.3-70b-versatile", t, "Groq") });
  if (e.XAI_API_KEY) list.push({ name: "Grok", run: (t) => openaiLike("https://api.x.ai/v1/chat/completions", e.XAI_API_KEY!, e.XAI_MODEL || "grok-3-mini", t, "Grok") });
  if (e.LLAMA_API_KEY) list.push({ name: "Meta Llama", run: (t) => openaiLike("https://api.llama.com/compat/v1/chat/completions", e.LLAMA_API_KEY!, e.LLAMA_MODEL || "Llama-4-Maverick-17B-128E-Instruct-FP8", t, "Meta Llama") });
  if (e.OPENROUTER_API_KEY) list.push({ name: "OpenRouter", run: (t) => openaiLike("https://openrouter.ai/api/v1/chat/completions", e.OPENROUTER_API_KEY!, e.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", t, "OpenRouter") });
  if (e.ANTHROPIC_API_KEY) list.push({ name: "Claude", run: claude });
  return list;
}

// remember which providers were out of quota recently, so we don't hit them on every request
const coolUntil: Record<string, number> = {};

async function generate(text: string, prefer?: string) {
  const all = providers();
  const ready = all.filter((p) => !(coolUntil[p.name] > Date.now()));
  const base = ready.length ? ready : all;
  // the caller's preferred provider goes first (parallel workers each pin one), the rest are the fallback chain
  const order = prefer ? [...base.filter((p) => p.name === prefer), ...base.filter((p) => p.name !== prefer)] : base;
  const fails: string[] = [];
  for (const p of order) {
    try {
      const out = parse(await p.run(text));
      if (!out.length) throw err("empty answer", 502);
      delete coolUntil[p.name];
      return { out, provider: p.name };
    } catch (e) {
      const st = (e as { status?: number }).status || 500;
      fails.push(`${p.name}: ${String((e as Error).message).slice(0, 120)}`);
      if (st === 429) coolUntil[p.name] = Date.now() + 60_000;             // limit reached → rest a minute
      else if (st === 401 || st === 403) coolUntil[p.name] = Date.now() + 3600_000; // bad key → skip for an hour
    }
  }
  throw err(`كل مفاتيح الذكاء الاصطناعي وصلت لحدها أو فيها مشكلة — ${fails.join(" | ")}`, 429);
}

/** Which providers are configured (names only — never the keys). */
export async function GET(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ providers: providers().map((p) => p.name) });
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!providers().length) return Response.json({ error: "مفيش ولا مفتاح ذكاء اصطناعي متضاف في Vercel (GEMINI_API_KEY / GROQ_API_KEY / XAI_API_KEY / LLAMA_API_KEY)" }, { status: 500 });
  const { items, names, prefer } = (await req.json()) as { items: In[]; names?: boolean; prefer?: string };
  if (!Array.isArray(items) || !items.length || items.length > 10) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const text = prompt(items, names !== false);
    const { out, provider } = await generate(text, prefer);
    return Response.json({ provider, items: out.map((o) => ({ ...o, name: names === false ? items.find((i) => i.id === o.id)?.name || o.name : o.name || items.find((i) => i.id === o.id)?.name || "" })) });
  } catch (e) {
    const err = e as Error & { status?: number };
    return Response.json({ error: String(err.message || e) }, { status: err.status === 429 ? 429 : 500 });
  }
}
