/* Rewrites product names/descriptions professionally (admin only).
 * Rotates between every AI key set in Vercel (Gemini, Groq, xAI Grok, Meta Llama, OpenRouter, Claude) so the
 * free daily limits add up: when one provider says "limit reached", the next one takes over. Never invents specs: it only reorganises what we have. */
import { isAdminToken } from "@/lib/serverAuth";
import { aiGenerate, providers } from "@/lib/ai";

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

/** Which providers are configured (names only — never the keys). */
export async function GET(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ providers: providers().map((p) => p.name) });
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!providers().length) return Response.json({ error: "مفيش ولا مفتاح ذكاء اصطناعي متضاف في Vercel (GEMINI_API_KEY / GROQ_API_KEY / XAI_API_KEY / META_API_KEY)" }, { status: 500 });
  const { items, names, prefer } = (await req.json()) as { items: In[]; names?: boolean; prefer?: string };
  if (!Array.isArray(items) || !items.length || items.length > 10) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const text = prompt(items, names !== false);
    const { out, provider } = await aiGenerate(text, parse, prefer);
    return Response.json({ provider, items: out.map((o) => ({ ...o, name: names === false ? items.find((i) => i.id === o.id)?.name || o.name : o.name || items.find((i) => i.id === o.id)?.name || "" })) });
  } catch (e) {
    const err = e as Error & { status?: number };
    return Response.json({ error: String(err.message || e) }, { status: err.status === 429 ? 429 : 500 });
  }
}
