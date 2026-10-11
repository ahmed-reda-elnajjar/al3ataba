export type Tier = { min: number; price: number };
export type Spec = { k: string; v: string };
export type PStatus = "active" | "pending" | "hidden";
export type Product = {
  id: string; name: string; description: string; categoryId: string; categoryName: string;
  unit: string; moq: number; tiers: Tier[]; governorate: string;
  merchantId: string; merchantName: string; ownerUid: string;
  images: string[]; videos?: string[]; media?: string[]; specs: Spec[]; colors: string[];
  packSize?: number | null; // pieces inside one sale unit (e.g. a "شريحة" of 435 cases)
  supplierId?: string | null; // internal supplier (admin-only name in /suppliers)
  basePrices?: number[] | null; markup?: number | null; markupTiers?: { min: number; pct: number }[] | null; // original prices before our % markup (one per tier)
  cod: boolean; madeInEgypt: boolean; logoPrint: boolean;
  status: PStatus; keywords: string[]; createdAt?: { seconds: number };
  /* client-only: set by applyPromos() when a live offer covers this product */
  origTiers?: Tier[]; promo?: { id: string; title: string; label: string; color: string; min?: number; tiers?: Tier[] };
};
export type Promo = {
  id: string; title: string; sub?: string; kind: "percent" | "fixed"; value: number;
  scope: "all" | "category" | "products"; categoryIds: string[]; productIds: string[];
  startsAt?: string; endsAt?: string; // YYYY-MM-DD, optional
  active: boolean; color?: string; image?: string; order?: number; createdAt?: { seconds: number };
  minQty?: number; // offer applies only when the cart holds at least this many pieces from the offer (mixing products allowed)
};
export type Category = { id: string; name: string; icon: string; order: number; image?: string };
export type Merchant = {
  id: string; name: string; type: string; governorate: string; city?: string; phone: string; about: string;
  regNo?: string; taxNo?: string; status: "pending" | "approved" | "rejected"; verified: boolean;
  ownerUid: string; plan: string; email?: string; createdAt?: { seconds: number };
};
export type CartItem = {
  id: string; productId: string; name: string; merchantId: string; merchant: string;
  qty: number; price: number; promo?: string; promoId?: string; promoMin?: number; promoTiers?: Tier[]; promoOn?: boolean; image?: string; unit: string; moq: number; fixed?: boolean; tiers?: Tier[]; cod?: boolean;
};
export type Order = {
  id: string; orderNo: string; userId: string; buyerName: string; phone: string;
  merchantId: string; merchantName: string; items: CartItem[];
  address: { governorate: string; city: string; street: string; landmark?: string };
  shipping: { method: string; cost: number }; payment: string;
  subtotal: number; total: number; status: string; trackingNo?: string; note?: string;
  createdAt?: { seconds: number };
};
export type Rfq = {
  id: string; userId: string; buyerName: string; product: string; categoryName: string; quantity: number; unit: string;
  budget: string; governorate: string; neededBy: string; specs: string; image?: string; status: "open" | "closed"; kind?: "wholesale" | "retail";
  createdAt?: { seconds: number };
};
export type Offer = {
  id: string; rfqId: string; rfqOwnerId: string; rfqProduct: string; quantity: number;
  merchantId: string; merchantName: string; price: number; total: number; days: number; note: string;
  status: "pending" | "accepted"; createdAt?: { seconds: number };
};
export type Settings = {
  shippingPerMerchant: number; whatsapp: string; supportPhone: string; paymentInstructions: string; announcement: string;
  heroTitle: string; heroSub: string; heroImage: string; city: string;
  markupRules?: { from: number; tiers: { min: number; pct: number }[] }[];
};
