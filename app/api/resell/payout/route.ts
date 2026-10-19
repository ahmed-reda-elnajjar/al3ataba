/* A reseller asks to withdraw commission. The available balance is recomputed here from their delivered orders. */
import { userFromToken } from "@/lib/serverAuth";
import { addDocSA, getDocSA, queryEq } from "@/lib/sa";
import { PAYOUT_METHODS, resellSettings, wallet, type Payout, type ROrder, type Reseller } from "@/lib/resell";
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
    if (!(amount > 0)) return bad("اكتب المبلغ");
    const [orders, payouts, site] = await Promise.all([
      queryEq<ROrder>("rorders", "resellerId", user.uid),
      queryEq<Payout>("payouts", "resellerId", user.uid),
      getDocSA<Settings>("settings/site"),
    ]);
    if (payouts.some((p) => p.status === "requested")) return bad("عندك طلب سحب لسه بيتراجع — استنى لما يتحوّل");
    const w = wallet(orders, payouts, resellSettings(site?.resell).holdDays);
    if (amount > w.available) return bad(`المتاح للسحب ${w.available} ج.م بس`);
    // money always goes to the number saved on the reseller's profile
    const id = await addDocSA("payouts", { resellerId: user.uid, resellerName: me.name, amount, method: me.payMethod, number: me.payNumber, status: "requested", createdAt: new Date(), paidAt: null, methodLabel: PAYOUT_METHODS[me.payMethod] || me.payMethod });
    return Response.json({ id, amount });
  } catch (e) {
    const x = e as Error & { status?: number };
    return bad(String(x.message || e), x.status || 500);
  }
}
