/* Admin-only Cloudflare Workers AI check — tells exactly why image redraw is rejected, never returns the token. */
import { isAdminToken } from "@/lib/serverAuth";
import { cfAccounts } from "@/lib/aiImage";

export const dynamic = "force-dynamic";

async function cf(path: string, key: string) {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j?.success !== false, status: r.status, msg: String(j?.errors?.[0]?.message || j?.messages?.[0]?.message || ""), code: j?.errors?.[0]?.code, result: j?.result };
  } catch (e) { return { ok: false, status: 0, msg: String((e as Error).message), code: 0, result: null }; }
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "للإدارة بس" }, { status: 403 });
  const rawKey = process.env.CF_API_TOKEN || "", rawAcc = process.env.CF_ACCOUNT_ID || "";
  const key = (rawKey.match(/cfut_[A-Za-z0-9_-]+/) || rawKey.replace(/^.*Bearer\s+/i, "").match(/[A-Za-z0-9_-]{30,}/) || [""])[0];
  const acc = (rawAcc.match(/[a-f0-9]{32}/i) || [""])[0];
  const lines: string[] = [];
  lines.push(`CF_API_TOKEN: ${rawKey ? `موجود (${key.length} حرف، بيبدأ بـ ${key.slice(0, 4)}…)` : "مش موجود في Vercel"}${rawKey.trim() !== key && rawKey ? " — فيه كلام زيادة حواليه (اتشال تلقائياً)" : ""}`);
  lines.push(`CF_ACCOUNT_ID: ${acc ? `مظبوط (…${acc.slice(-4)})` : rawAcc ? "مش 32 حرف" : "مش موجود"}`);
  if (!key || !acc) return Response.json({ ok: false, lines, fix: "ضيف المتغير الناقص في Vercel واعمل Redeploy." });

  const user = await cf("/user/tokens/verify", key);
  const account = user.ok ? null : await cf(`/accounts/${acc}/tokens/verify`, key);
  const valid = user.ok || account?.ok;
  lines.push(`التوكن نفسه: ${valid ? `شغّال ✓ (${user.ok ? "User token" : "Account token"}، حالته ${(user.ok ? user.result : account?.result)?.status || "active"})` : `مرفوض ✗ (${user.msg || account?.msg})`}`);
  if (!valid) return Response.json({ ok: false, lines, fix: "التوكن اللي في Vercel مش صالح (غالباً قديم من قبل الـ Roll، أو اتنسخ ناقص). اعمل Roll، انسخه بزرار Copy، حطه في CF_API_TOKEN، Save، وبعدين Redeploy." });

  const ai = await cf(`/accounts/${acc}/ai/models/search?per_page=1`, key);
  lines.push(`الوصول لـ Workers AI على الحساب ده: ${ai.ok ? "شغّال ✓" : `مرفوض ✗ (${ai.msg || ai.status})`}`);
  if (!ai.ok) {
    const list = await cfAccounts(key);
    const good: string[] = [];
    for (const a of list) { if ((await cf(`/accounts/${a.id}/ai/models/search?per_page=1`, key)).ok) good.push(`${a.name || "حساب"} (${a.id})`); }
    lines.push(`الحسابات اللي التوكن شايفها: ${list.length ? list.map((a) => `${a.name || "حساب"} …${a.id.slice(-4)}`).join("، ") : "مقدرتش أجيبها"}`);
    if (good.length) return Response.json({ ok: true, lines, fix: `الـ CF_ACCOUNT_ID اللي في Vercel غلط، بس الموقع هيستخدم الحساب الصح لوحده ✓ — جرّب إعادة الرسم دلوقتي. ولو عايز تصلّحه: حط في CF_ACCOUNT_ID ده: ${good[0]}` });
    return Response.json({ ok: false, lines, fix: "التوكن مش واصل لـ Workers AI على أي حساب. اتأكد إن الصلاحيات Workers AI (Read + Edit) واتعمل Update token." });
  }
  return Response.json({ ok: true, lines, fix: "كله مظبوط ✓ — إعادة الرسم المفروض تشتغل بـ Cloudflare." });
}
