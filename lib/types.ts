export type Tier = { min: number; price: number };
export type Spec = { k: string; v: string };
export type PStatus = "active" | "pending" | "hidden";
export type Product = {
  id: string; name: string; description: string; categoryId: string; categoryName: string;
  unit: string; moq: number; tiers: Tier[]; governorate: string;
  merchantId: string; merchantName: string; ownerUid: string;
  images: string[]; videos?: string[]; specs: Spec[]; colors: string[];
  cod: boolean; madeInEgypt: boolean; logoPrint: boolean;
  status: PStatus; keywords: string[]; createdAt?: { seconds: number };
};
export type Category = { id: string; name: string; icon: string; order: number; image?: string };
export type Merchant = {
  id: string; name: string; type: string; governorate: string; city?: string; phone: string; about: string;
  regNo?: string; taxNo?: string; status: "pending" | "approved" | "rejected"; verified: boolean;
  ownerUid: string; plan: string; email?: string; createdAt?: { seconds: number };
};
export type CartItem = {
  id: string; productId: string; name: string; merchantId: string; merchant: string;
  qty: number; price: number; image?: string; unit: string; moq: number; fixed?: boolean; tiers?: Tier[]; cod?: boolean;
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
};
