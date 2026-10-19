/* A reseller places an order for their customer. Prices are computed HERE (never trusted from the browser). */
import { userFromToken } from "@/lib/serverAuth";
import { addDocSA, getDocSA, listSA } from "@/lib/sa";
import { registerCats } from "@/lib/cats";
import { GOVERNORATES } from "@/lib/config";
import { PHONE_RE, fullAddress, baseUnit, canResell, defaultCommission, isRetail, maxQty, minQty, money, normPhone, resellSettings, shipFor, type RCustomer, type RItem, type Reseller } from "@/lib/resell";
import type { Category, Product, Promo, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const txt = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function POST(req: Request) {
  const user = await userFromToken(req.headers.get("x-firebase-token") || "");
  if (!user) return bad("سجّل دخول الأول", 401);
  try {
    const me = await getDocSA<Reseller>(`resellers/${user.uid}`);
    if (!me || me.status !== "approved") return bad("حساب البيع بالعمولة لسه مش متفعّل", 403);

    const body = await req.json().catch(() => ({}));
    const c = body.customer || {};
    const parts = { area: txt(c.area, 80), street: txt(c.street, 120), building: txt(c.building, 20), floor: txt(c.floor, 10), apartment: txt(c.apartment, 10), landmark: txt(c.landmark, 120) };
    const postal = String(c.postal || "").replace(/[٠-٩]/g, (d: string) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, 5);
    const customer: RCustomer = { name: txt(c.name, 80), phone: normPhone(c.phone), phone2: normPhone(c.phone2 || ""), governorate: txt(c.governorate, 40), ...parts, postal, address: fullAddress(parts), notes: txt(c.notes, 300), allowOpen: c.allowOpen !== false };
    if (customer.name.length < 3) return bad("اكتب اسم المستلم");
    if (!PHONE_RE.test(customer.phone)) return bad("رقم تليفون المستلم مش صحيح (لازم 11 رقم يبدأ بـ 01)");
    if (customer.phone2 && !PHONE_RE.test(customer.phone2)) return bad("الرقم التاني مش صحيح");
    if (!GOVERNORATES.includes(customer.governorate)) return bad("اختار المحافظة");
    if (parts.area.length < 2) return bad("اكتب المنطقة / المدينة");
    if (parts.street.length < 2) return bad("اكتب اسم الشارع");
    if (!parts.building) return bad("اكتب رقم العمارة");
    if (postal && postal.length !== 5) return bad("الرقم البريدي لازم يكون 5 أرقام");

    const raw: { productId: string; qty: number; commission?: number | null }[] = Array.isArray(body.items) ? body.items : [];
    if (!raw.length || raw.length > 30) return bad("الطلب لازم يكون فيه من منتج لـ 30 منتج");
    if (new Set(raw.map((r) => r.productId)).size !== raw.length) return bad("فيه منتج متكرر في الطلب");

    const [site, promos, cats] = await Promise.all([
      getDocSA<Settings>("settings/site"),
      listSA<Promo>("promos").catch(() => [] as Promo[]),
      listSA<Category>("categories").catch(() => [] as Category[]),
    ]);
    registerCats(cats); // offers on a main category cover its sub-categories
    const rs = resellSettings(site?.resell);

    const items: RItem[] = [];
    for (const it of raw) {
      const p = await getDocSA<Product>(`products/${String(it.productId).replace(/[^\w-]/g, "")}`);
      if (!p || !canResell(p)) return bad(`منتج مش متاح للبيع بالعمولة دلوقتي${p ? `: ${p.name}` : ""}`);
      const qty = Math.floor(Number(it.qty));
      if (!(qty >= minQty(p) && qty <= maxQty(p))) return bad(`الكمية في "${p.name}" لازم تكون من ${minQty(p)}${maxQty(p) < 10000 ? ` لـ ${maxQty(p)}` : ""}`);
      const base = baseUnit(p, qty, promos, rs);
      if (!(base > 0)) return bad(`مفيش سعر للمنتج "${p.name}"`);
      const commission = it.commission === null || it.commission === undefined || (it.commission as unknown) === "" ? defaultCommission(p, base, rs, cats) : Math.round(Number(it.commission));
      if (!(commission >= 0 && commission <= 100000)) return bad(`العمولة في "${p.name}" مش صحيحة`);
      const img = (p.images || []).find((u) => typeof u === "string" && u.startsWith("http")) || "";
      items.push({ productId: p.id, name: p.name, image: img, unit: p.unit || "قطعة", qty, retail: isRetail(p, qty), base, commission, price: base + commission });
    }
    const subtotal = money(items.reduce((a, i) => a + i.price * i.qty, 0));
    const commissionTotal = money(items.reduce((a, i) => a + i.commission * i.qty, 0));
    const shipping = shipFor(customer.governorate, rs);
    const now = Date.now();
    const id = await addDocSA("rorders", {
      resellerId: user.uid, resellerName: me.name, resellerPhone: me.phone, customer, items, subtotal, shipping, total: money(subtotal + shipping), commissionTotal,
      status: "new", history: [{ status: "new", at: now }], deliveredAt: null, createdAt: new Date(now),
    });
    return Response.json({ id, total: money(subtotal + shipping), commissionTotal });
  } catch (e) {
    const x = e as Error & { status?: number };
    return bad(String(x.message || e), x.status || 500);
  }
}
