export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const dateStr = (t?: { seconds: number }) => (t ? new Date(t.seconds * 1000).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "");
export const ms = (t?: { seconds: number }) => (t ? t.seconds : 0);
export const orderNo = () => `AL-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
export const waLink = (num: string, text = "") => `https://wa.me/${num.replace(/\D/g, "").replace(/^0/, "20")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
