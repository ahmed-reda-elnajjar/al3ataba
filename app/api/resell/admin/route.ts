/* Admin side of "البيع بالعمولة": list everything, change order status, approve resellers, settle withdrawals, save settings. */
import { revalidateTag } from "next/cache";
import { isAdminToken } from "@/lib/serverAuth";
import { getDocSA, listNewestSA, listSA, patchDocSA } from "@/lib/sa";
import { CATALOG_TAG } from "@/lib/catalog";
import { RNEXT, resellSettings, type Payout, type ROrder, type RStatus, type Reseller, type ResellSettings } from "@/lib/resell";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const sec = (t?: { seconds: number }) => t?.seconds ?? 0;

export async function GET(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return bad("unauthorized", 401);
  try {
    const [orders, resellers, payouts, site] = await Promise.all([
      listNewestSA<ROrder>("rorders", 500),
      listSA<Reseller>("resellers", 300),
      listNewestSA<Payout>("payouts", 300),
      getDocSA<Settings>("settings/site"),
    ]);
    resellers.sort((a, b) => sec(b.createdAt) - sec(a.createdAt));
    return Response.json({ orders, resellers, payouts, settings: resellSettings(site?.resell) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { const x = e as Error & { status?: number }; return bad(String(x.message || e), x.status || 500); }
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return bad("unauthorized", 401);
  try {
    const b = await req.json().catch(() => ({}));
    const id = String(b.id || "").replace(/[^\w-]/g, "");
    if (b.action === "order") {
      const o = await getDocSA<ROrder>(`rorders/${id}`);
      if (!o) return bad("الطلب مش موجود", 404);
      const to = b.status as RStatus;
      if (!RNEXT[o.status]?.includes(to)) return bad(`مينفعش الطلب يتنقل من "${o.status}" لـ "${to}"`);
      const now = Date.now();
      await patchDocSA(`rorders/${id}`, { status: to, history: [...(o.history || []), { status: to, at: now }], deliveredAt: to === "delivered" ? now : null });
      return Response.json({ ok: true });
    }
    if (b.action === "reseller") {
      if (!["approved", "suspended", "pending"].includes(b.status)) return bad("حالة غلط");
      await patchDocSA(`resellers/${id}`, { status: b.status });
      return Response.json({ ok: true });
    }
    if (b.action === "payout") {
      const p = await getDocSA<Payout>(`payouts/${id}`);
      if (!p) return bad("طلب السحب مش موجود", 404);
      if (p.status !== "requested") return bad("طلب السحب ده اتقفل قبل كده");
      if (!["paid", "rejected"].includes(b.status)) return bad("حالة غلط");
      await patchDocSA(`payouts/${id}`, { status: b.status, paidAt: b.status === "paid" ? Date.now() : null, note: String(b.note || "").slice(0, 200) });
      return Response.json({ ok: true });
    }
    if (b.action === "settings") {
      const s = b.resell as Partial<ResellSettings>;
      const nums = (o: unknown) => Object.fromEntries(Object.entries((o as Record<string, unknown>) || {}).filter(([, v]) => typeof v === "number" && isFinite(v as number) && (v as number) >= 0)) as Record<string, number>;
      const clean = resellSettings({ commissionPct: Number(s.commissionPct), retailPct: Number(s.retailPct), shipDefault: Number(s.shipDefault), holdDays: Number(s.holdDays) });
      const resell = { commissionPct: clean.commissionPct, retailPct: clean.retailPct, shipDefault: clean.shipDefault, holdDays: clean.holdDays, catCommission: nums(s.catCommission), ship: nums(s.ship) };
      await patchDocSA("settings/site", { resell });
      revalidateTag(CATALOG_TAG); // resellers see the new numbers right away
      return Response.json({ ok: true, resell });
    }
    return bad("طلب غير معروف");
  } catch (e) { const x = e as Error & { status?: number }; return bad(String(x.message || e), x.status || 500); }
}
