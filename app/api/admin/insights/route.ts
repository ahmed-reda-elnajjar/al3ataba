/* Admin dashboard data (GET) and the AI advisor (POST). Admin only. */
import { isAdminToken } from "@/lib/serverAuth";
import { aiBrief, buildInsights } from "@/lib/insights";
import { aiGenerate, providers } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return bad("unauthorized", 401);
  const days = Math.min(365, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  try { return Response.json(await buildInsights(days), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { const x = e as Error & { status?: number }; return bad(String(x.message || e), x.status || 500); }
}

type Advice = { summary: string; problems: { title: string; detail: string; priority: string }[]; opportunities: { title: string; detail: string }[]; actions: { title: string; detail: string; impact: string }[] };

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return bad("unauthorized", 401);
  if (!providers().length) return bad("مفيش مفتاح ذكاء اصطناعي متضاف في Vercel", 500);
  const days = Math.min(365, Math.max(7, Number((await req.json().catch(() => ({}))).days) || 30));
  try {
    const brief = aiBrief(await buildInsights(days));
    const prompt = `أنت مستشار نمو وعمليات لموقع "العتبة أونلاين": سوق جملة مصري أونلاين (زي علي بابا) فيه:
- بيع جملة للتجار وأصحاب المحلات (طلبات عادية).
- نظام بيع بالعمولة: بائعين بياخدوا منتجاتنا ويبيعوها لعملائهم بعمولة، والدفع عند الاستلام.
- منتجات مستوردة من موردين (أغلبها إكسسوارات موبايل)، وتجار تانيين بيعرضوا منتجاتهم.

دي أرقام آخر ${days} يوم (مجمّعة، بالجنيه المصري). اقرأها كويس وطلّع تحليل عملي:
${JSON.stringify(brief)}

المطلوب (بالعامية المصرية البسيطة، أرقام محددة من البيانات، من غير كلام عام):
1) "summary": 3-4 جمل عن الوضع الحالي.
2) "problems": أهم المشاكل والمخاطر اللي شايفها في الأرقام (لكل واحدة: title، detail فيه الرقم اللي بيدل عليها، priority: عالي/متوسط/منخفض).
3) "opportunities": فرص توسع ونمو واضحة من البيانات (أقسام/محافظات/منتجات/قنوات بيع/بائعين).
4) "actions": أهم 5 خطوات يعملها صاحب الموقع الأسبوع ده، مرتبة بالأولوية (لكل واحدة: title، detail إزاي ينفذها، impact الأثر المتوقع).
لو البيانات قليلة قول كده واقترح إزاي يجمع بيانات أكتر. ماتخترعش أرقام مش موجودة.
رجّع JSON فقط بالشكل: {"summary":"...","problems":[...],"opportunities":[...],"actions":[...]}`;
    const parse = (text: string): Advice[] => {
      const s = text.replace(/```(?:json)?/g, ""); const a = s.indexOf("{"), b = s.lastIndexOf("}");
      const j = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
      return j && (j.summary || j.actions) ? [{ summary: String(j.summary || ""), problems: j.problems || [], opportunities: j.opportunities || [], actions: j.actions || [] }] : [];
    };
    const { out, provider } = await aiGenerate(prompt, parse);
    return Response.json({ ...out[0], provider, at: Date.now() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { const x = e as Error & { status?: number }; return bad(String(x.message || e), x.status === 429 ? 429 : 500); }
}
