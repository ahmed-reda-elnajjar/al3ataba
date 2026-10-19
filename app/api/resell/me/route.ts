/* The signed-in reseller: GET → profile + their orders + withdrawals; POST → apply / update profile.
 * Everything goes through the server (service account), so it works regardless of the browser's Firestore rules. */
import { userFromToken } from "@/lib/serverAuth";
import { getDocSA, patchDocSA, queryEq, setDocSA } from "@/lib/sa";
import { GOVERNORATES } from "@/lib/config";
import { PHONE_RE, normPhone, type Payout, type ROrder, type Reseller } from "@/lib/resell";

export const dynamic = "force-dynamic";
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const sec = (t?: { seconds: number }) => t?.seconds ?? 0;

export async function GET(req: Request) {
  const user = await userFromToken(req.headers.get("x-firebase-token") || "");
  if (!user) return bad("سجّل دخول الأول", 401);
  try {
    const me = await getDocSA<Reseller>(`resellers/${user.uid}`);
    if (!me || me.status !== "approved") return Response.json({ me, orders: [], payouts: [] }, { headers: { "Cache-Control": "no-store" } });
    const [orders, payouts] = await Promise.all([queryEq<ROrder>("rorders", "resellerId", user.uid), queryEq<Payout>("payouts", "resellerId", user.uid)]);
    orders.sort((a, b) => sec(b.createdAt) - sec(a.createdAt));
    payouts.sort((a, b) => sec(b.createdAt) - sec(a.createdAt));
    return Response.json({ me, orders, payouts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { const x = e as Error & { status?: number }; return bad(String(x.message || e), x.status || 500); }
}

export async function POST(req: Request) {
  const user = await userFromToken(req.headers.get("x-firebase-token") || "");
  if (!user) return bad("سجّل دخول الأول", 401);
  try {
    const b = await req.json().catch(() => ({}));
    const name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const phone = normPhone(b.phone);
    const governorate = String(b.governorate || "");
    const payMethod = b.payMethod === "instapay" ? "instapay" : "vcash";
    const payNumber = payMethod === "vcash" ? normPhone(b.payNumber) : String(b.payNumber || "").trim().slice(0, 80);
    if (name.length < 3) return bad("اكتب اسمك");
    if (!PHONE_RE.test(phone)) return bad("رقم التليفون لازم يكون 11 رقم يبدأ بـ 01");
    if (!GOVERNORATES.includes(governorate)) return bad("اختار المحافظة");
    if (payMethod === "vcash" && !PHONE_RE.test(payNumber)) return bad("رقم فودافون كاش لازم يكون 11 رقم يبدأ بـ 01");
    if (payMethod === "instapay" && payNumber.length < 4) return bad("اكتب عنوان إنستاباي أو الرقم");
    const me = await getDocSA<Reseller>(`resellers/${user.uid}`);
    if (me) await patchDocSA(`resellers/${user.uid}`, { name, phone, governorate, payMethod, payNumber });
    else await setDocSA(`resellers/${user.uid}`, { uid: user.uid, email: user.email, name, phone, governorate, payMethod, payNumber, status: "pending", createdAt: new Date() });
    return Response.json({ ok: true, created: !me });
  } catch (e) { const x = e as Error & { status?: number }; return bad(String(x.message || e), x.status || 500); }
}
