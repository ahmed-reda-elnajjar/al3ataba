/* Server-only: text AI with automatic rotation between every key set in Vercel
 * (Gemini, Groq, xAI Grok, Meta Llama, OpenRouter, Claude). When one hits its free limit the next takes over. */
/* ---- providers: every key you add in Vercel is used; when one hits its free limit we move to the next ---- */
export type Provider = { name: string; run: (text: string) => Promise<string> };
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

export function providers(): Provider[] {
  const e = process.env, list: Provider[] = [];
  if (e.GEMINI_API_KEY) for (const m of Array.from(new Set([e.GEMINI_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"]))) list.push({ name: `Gemini (${m})`, run: (t) => geminiOne(m, t) });
  if (e.GROQ_API_KEY) list.push({ name: "Groq", run: (t) => openaiLike("https://api.groq.com/openai/v1/chat/completions", e.GROQ_API_KEY!, e.GROQ_MODEL || "llama-3.3-70b-versatile", t, "Groq") });
  if (e.XAI_API_KEY) list.push({ name: "Grok", run: (t) => openaiLike("https://api.x.ai/v1/chat/completions", e.XAI_API_KEY!, e.XAI_MODEL || "grok-3-mini", t, "Grok") });
  // Meta's old Llama API (api.llama.com) shut down in July 2026 — its successor is the Meta Model API (api.meta.ai, Muse models).
  const metaKey = e.META_API_KEY || e.LLAMA_API_KEY;
  if (metaKey) list.push({ name: "Meta", run: (t) => openaiLike("https://api.meta.ai/v1/chat/completions", metaKey, e.META_MODEL || e.LLAMA_MODEL || "muse-spark-1.3", t, "Meta") });
  if (e.OPENROUTER_API_KEY) list.push({ name: "OpenRouter", run: (t) => openaiLike("https://openrouter.ai/api/v1/chat/completions", e.OPENROUTER_API_KEY!, e.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", t, "OpenRouter") });
  if (e.ANTHROPIC_API_KEY) list.push({ name: "Claude", run: claude });
  return list;
}

// remember which providers were out of quota recently, so we don't hit them on every request
const coolUntil: Record<string, number> = {};

export async function aiGenerate<T>(text: string, parse: (t: string) => T[], prefer?: string): Promise<{ out: T[]; provider: string }> {
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

