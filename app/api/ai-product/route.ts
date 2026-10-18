/* Rewrites product names/descriptions professionally (admin only).
 * Rotates between every AI key set in Vercel (Gemini, Groq, xAI Grok, Meta Llama, OpenRouter, Claude) so the
 * free daily limits add up: when one provider says "limit reached", the next one takes over. Never invents specs: it only reorganises what we have. */
import { isAdminToken } from "@/lib/serverAuth";
import { aiGenerate, providers, webProviders } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // web search takes longer

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

/** Web mode: research every product online first, then write a complete professional description. */
function webPrompt(items: In[], names: boolean) {
  const data = items.map((p) => ({ id: p.id, name: clean(p.name, 200), category: p.category || "", description: clean(p.description), specs: clean(p.specs || "", 700), colors: p.colors || "", sale_unit: p.unit || "", min_order: p.moq || 1, pieces_per_unit: p.packSize || undefined }));
  return `أنت كاتب محتوى محترف وباحث منتجات لمتجر جملة مصري اسمه "العتبة أونلاين" (عملاؤه أصحاب محلات وتجار).

المطلوب لكل منتج:
1) ابحث في الويب عن المنتج ده بالظبط باستخدام الماركة + رقم الموديل + الكلمات المهمة في الاسم والمواصفات (مثال: "GERLAX GD-12 cable 7A"). اقرأ صفحات المنتج الرسمية أو صفحات المتاجر الموثوقة.
2) خد بس المعلومات اللي متأكد إنها لنفس الموديل بالظبط (القدرة، الأمبير، الطول، نوع الوصلة، الخامة، السعة، المنافذ، التوافق، محتويات العلبة، الضمان لو مكتوب رسمياً...). لو مش لاقي نفس الموديل أو مش متأكد، ماتضيفش حاجة من الويب واكتفي بالبيانات اللي عندنا.
3) لازم تحافظ على كل تفصيلة موجودة في بياناتنا (الوصف الأصلي، المواصفات، الألوان، أكواد الموديل) وماتشيلش منها حاجة. ولو فيه تعارض بين الويب وبياناتنا، بياناتنا هي الصح.
4) اكتب الصياغة بعربي فصيح بسيط يفهمه التاجر المصري، احترافي ومن غير مبالغة.

${names ? `الاسم: واضح (حتى 70 حرف): نوع المنتج + الماركة + الموديل + أهم ميزة/مواصفة (مثال: "كابل شحن GERLAX Type-C سريع 7A - 1 متر"). لو الاسم الأصلي مش اسم منتج استنتجه.` : `الاسم: رجّعه زي ما هو بالظبط.`}

شكل الوصف (كل سطر لوحده، والنقاط تبدأ بـ "• "):
- سطر افتتاحي يعرّف المنتج واستخدامه.
- "المميزات:" ثم من 3 لـ 6 نقاط.
- "المواصفات:" ثم نقطة لكل مواصفة بالشكل "• الاسم: القيمة" (كل المواصفات المعروفة).
- "محتويات العلبة:" لو معروفة.
- "مناسب لـ: ..." لو مفهوم.

ممنوع: أسعار، أسماء متاجر أو مواقع، لينكات، أرقام تليفونات، إيموجي، ومعلومات مش متأكد منها.
احتفظ بالأكواد والماركات والوحدات بالإنجليزي كما هي (Type-C، 20W، 10000mAh).

في الآخر رجّع JSON فقط (من غير أي كلام قبله أو بعده) بالشكل: [{"id":"...","name":"...","description":"..."}] لنفس المنتجات وبنفس الـ id.

المنتجات:
${JSON.stringify(data)}`;
}

function parse(text: string): Out[] {
  // web answers may add text / citation marks around the JSON: take from the first "[{" to the last "]"
  const t = text.replace(/```(?:json)?/g, "");
  const a = t.search(/\[\s*\{/), b = t.lastIndexOf("]");
  const arr = JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
  const tidy = (s: string) => s.replace(/【[^】]*】|\[\d+(?:,\s*\d+)*\]|\(?https?:\/\/\S+\)?/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return (Array.isArray(arr) ? arr : []).filter((x) => x && x.id && x.description).map((x) => ({ id: String(x.id), name: tidy(String(x.name || "")), description: tidy(String(x.description)) }));
}

/** Which providers are configured (names only — never the keys). */
export async function GET(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ providers: providers().map((p) => p.name), web: webProviders().map((p) => p.name) });
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!providers().length) return Response.json({ error: "مفيش ولا مفتاح ذكاء اصطناعي متضاف في Vercel (GEMINI_API_KEY / GROQ_API_KEY / XAI_API_KEY / META_API_KEY)" }, { status: 500 });
  const { items, names, prefer, web } = (await req.json()) as { items: In[]; names?: boolean; prefer?: string; web?: boolean };
  if (!Array.isArray(items) || !items.length || items.length > 10) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const text = web ? webPrompt(items, names !== false) : prompt(items, names !== false);
    const { out, provider } = await aiGenerate(text, parse, prefer, !!web);
    return Response.json({ provider, items: out.map((o) => ({ ...o, name: names === false ? items.find((i) => i.id === o.id)?.name || o.name : o.name || items.find((i) => i.id === o.id)?.name || "" })) });
  } catch (e) {
    const err = e as Error & { status?: number };
    return Response.json({ error: String(err.message || e) }, { status: err.status === 429 ? 429 : 500 });
  }
}
