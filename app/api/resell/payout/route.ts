/* A reseller asks to withdraw commission. The available balance is recomputed here from their delivered orders. */
import { userFromToken } from "@/lib/serverAuth";
import { addDocSA, getDocSA, queryEq } from "@/lib/sa";
import { PHONE_RE, PAYOUT_METHODS, normPhone, resellSettings, wallet, type Payout, type ROrder, type Reseller } from "@/lib/resell";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const user = await userFromToken(req.headers.get("x-firebase-token") || "");
  if (!user) return bad("سجّل دخول الأول", 401);
  try {
    const me = await getDocSA<Reseller>(`resellers/${user.uid}`);
    if (!me || me.status !== "approved") return bad("حساب البيع بالعمولة مش متفعّل", 403);
    const body = await req.json().catch(() => ({}));
    const amount = Math.floor(Number(body.amount) * 100) / 100;
    const method = body.method === "instapay" ? "instapay" : "vcash";
    const number = method === "vcash" ? normPhone(body.number) : String(body.number || "").trim().slice(0, 80);
    if (!(amount > 0)) return bad("اكتب المبلغ");
    if (method === "vcash" && !PHONE_RE.test(number)) return bad("رقم فودافون كاش مش صحيح");
    if (method === "instapay" && number.length < 4) return bad("اكتب عنوان إنستاباي أو الرقم");
    const [orders, payouts, site] = await Promise.all([
      queryEq<ROrder>("rorders", "resellerId", user.uid),
      queryEq<Payout>("payouts", "resellerId", user.uid),
      getDocSA<Settings>("settings/site"),
    ]);
    if (payouts.some((p) => p.status === "requested")) return bad("عندك طلب سحب لسه بيتراجع — استنى لما يتحوّل");
    const w = wallet(orders, payouts, resellSettings(site?.resell).holdDays);
    if (amount > w.available) return bad(`المتاح للسحب ${w.available} ج.م بس`);
    const id = await addDocSA("payouts", { resellerId: user.uid, resellerName: me.name, amount, method, number, status: "requested", createdAt: new Date(), paidAt: null, methodLabel: PAYOUT_METHODS[method] });
    return Response.json({ id, amount });
  } catch (e) {
    const x = e as Error & { status?: number };
    return bad(String(x.message || e), x.status || 500);
  }
}
