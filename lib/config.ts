// Client-side hint only. The real enforcement is in firestore.rules (keep the two in sync).
export const ADMIN_EMAILS = ["a7mdelnagar297@gmail.com"];

export const GOVERNORATES = ["القاهرة", "الجيزة", "الإسكندرية", "القليوبية", "الشرقية", "الدقهلية", "البحيرة", "الغربية", "المنوفية", "كفر الشيخ", "دمياط", "بورسعيد", "الإسماعيلية", "السويس", "شمال سيناء", "جنوب سيناء", "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان", "البحر الأحمر", "الوادي الجديد", "مطروح"];
export const MERCHANT_TYPES = ["مصنع", "مستورد", "تاجر جملة", "موزّع"];
export const ORDER_STATUS: Record<string, string> = { new: "جديد", confirmed: "مؤكد", shipped: "تم الشحن", delivered: "تم التسليم", cancelled: "ملغي" };
export const STATUS_FLOW = ["new", "confirmed", "shipped", "delivered", "cancelled"];
export const PAY_METHODS = [
  { id: "cod", label: "الدفع عند الاستلام", icon: "ph-hand-coins" },
  { id: "vcash", label: "فودافون كاش", icon: "ph-device-mobile" },
  { id: "instapay", label: "إنستاباي / تحويل بنكي", icon: "ph-bank" },
  { id: "transfer", label: "تحويل", icon: "ph-bank", hidden: true },
];
export const isTransfer = (id: string) => id === "vcash" || id === "instapay" || id === "transfer";
export const SHIP_METHODS = [
  { id: "ship", label: "شحن لعنوانك", icon: "ph-truck" },
  { id: "pickup", label: "استلام من المورد", icon: "ph-warehouse" },
];
export const ICONS = ["ph-cooking-pot", "ph-gift", "ph-wrench", "ph-package", "ph-t-shirt", "ph-pencil-simple", "ph-coffee", "ph-armchair", "ph-lightbulb", "ph-car", "ph-plant", "ph-bag", "ph-factory", "ph-hammer", "ph-bowl-food", "ph-first-aid-kit", "ph-device-mobile", "ph-paint-brush"];
export const DEFAULT_CATEGORIES = [
  { name: "أدوات منزلية", icon: "ph-cooking-pot" }, { name: "لعب وهدايا", icon: "ph-gift" },
  { name: "خردوات وعدد", icon: "ph-wrench" }, { name: "مستلزمات تغليف", icon: "ph-package" },
  { name: "ملابس وأقمشة", icon: "ph-t-shirt" }, { name: "أدوات مكتبية", icon: "ph-pencil-simple" },
  { name: "مطاعم وكافيهات", icon: "ph-coffee" }, { name: "أثاث", icon: "ph-armchair" },
];
export const DEFAULT_SETTINGS = {
  shippingPerMerchant: 120,
  whatsapp: "",
  supportPhone: "",
  paymentInstructions: "حوّل المبلغ على رقم إنستاباي / فودافون كاش اللي هيوصلك من فريق العتبة، وابعت صورة التحويل على واتساب.",
  announcement: "",
  heroTitle: "منتجات الجملة بأسعار حقيقية",
  heroSub: "من كل أسواق مصر .. في مكان واحد",
  heroImage: "",
  city: "القاهرة",
};
export const HOUSE = { id: "al3ataba", name: "العتبة" };
