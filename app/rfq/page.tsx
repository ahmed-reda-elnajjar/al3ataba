"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { dbI } from "@/lib/firebase";
import { st } from "@/lib/style";
import { GOVERNORATES } from "@/lib/config";
import { useAsync } from "@/lib/hooks";
import { uploadImage } from "@/lib/img";
import { useApp } from "@/lib/providers";
import { listCategories } from "@/lib/store";
import { RequireLogin } from "@/components/Guard";

function Form() {
  const { user } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const { data: cats } = useAsync(listCategories);
  const [f, setF] = useState({ product: sp.get("product") || "", categoryId: sp.get("cat") || "", quantity: "", unit: "قطعة", budget: "", governorate: "", neededBy: "", specs: "" });
  const [image, setImage] = useState("");
  const [kind, setKind] = useState<"wholesale" | "retail">("wholesale");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const pick = async (file?: File) => {
    if (!file || !user) return;
    setBusy(true);
    try { setImage(await uploadImage(file, user.uid, "rfqs")); } catch { setError("مقدرناش نرفع الصورة."); }
    setBusy(false);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const quantity = Number(f.quantity);
    if (!f.product.trim() || !(quantity > 0)) { setError("اكتب اسم المنتج وكمية صحيحة."); return; }
    setBusy(true); setError("");
    try {
      await addDoc(collection(dbI(), "rfqs"), {
        userId: user.uid, buyerName: user.displayName || user.email || user.phoneNumber || "مشتري",
        product: f.product.trim(), categoryName: cats?.find((c) => c.id === f.categoryId)?.name || "", quantity, unit: f.unit.trim() || "قطعة",
        budget: f.budget.trim(), governorate: f.governorate, neededBy: f.neededBy, specs: f.specs.trim(), image,
        kind, status: "open", createdAt: serverTimestamp(),
      });
      router.push("/account?tab=rfq");
    } catch { setError("مقدرناش نبعت الطلب دلوقتي. جرّب تاني."); setBusy(false); }
  };

  return (
    <div className="wc" style={{ maxWidth: 720 }}>
      <h1>طلب منتج</h1>
      <p className="mu" style={{ margin: "6px 0 16px" }}>اكتب طلبك والتجار المسجّلين يبعتولك أسعارهم، وإنت تقارن وتختار.</p>
      <form className="card col" onSubmit={submit}>
        <div className="seg"><button type="button" className={kind === "wholesale" ? "on" : ""} onClick={() => setKind("wholesale")}>جملة</button><button type="button" className={kind === "retail" ? "on" : ""} onClick={() => setKind("retail")}>تجزئة</button></div>
        <div className="fld"><label>اسم المنتج</label><input className="in" required value={f.product} onChange={set("product")} placeholder="كوبايات زجاج بشعار المطعم" /></div>
        <div className="grid" style={st("--m:1;--d:2")}>
          <div className="fld"><label>القسم</label><select className="in" value={f.categoryId} onChange={set("categoryId")}><option value="">اختار</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="fld"><label>المحافظة</label><select className="in" value={f.governorate} onChange={set("governorate")}><option value="">اختار</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></div>
          <div className="fld"><label>الكمية المطلوبة</label><input className="in" inputMode="numeric" required value={f.quantity} onChange={set("quantity")} placeholder="2000" /></div>
          <div className="fld"><label>الوحدة</label><input className="in" value={f.unit} onChange={set("unit")} placeholder="قطعة / طقم / كرتونة" /></div>
          <div className="fld"><label>الميزانية (اختياري)</label><input className="in" value={f.budget} onChange={set("budget")} placeholder="حوالي 40,000 ج.م" /></div>
          <div className="fld"><label>مطلوب قبل (اختياري)</label><input className="in" type="date" value={f.neededBy} onChange={set("neededBy")} /></div>
        </div>
        <div className="fld"><label>ملاحظات إضافية / المواصفات</label><textarea className="in" value={f.specs} onChange={set("specs")} placeholder="شفاف، سعة 250 مل، طباعة لوجو لون واحد" /></div>
        <div className="fld"><label>صورة توضيحية (اختياري)</label>
          {image && <div className="thumbs"><div className="t"><img src={image} alt="" /><button type="button" onClick={() => setImage("")}>×</button></div></div>}
          {!image && <label className="drop"><i className="ph ph-camera" /><span>اضغط لإضافة صورة</span><input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} /></label>}</div>
        {error && <p className="err">{error}</p>}
        <button className="btn blk" type="submit" disabled={busy}>{busy ? "جاري الإرسال…" : "إرسال الطلب"}</button>
      </form>
    </div>
  );
}

export default function Rfq() { return <RequireLogin why="سجّل دخولك عشان التجار يقدروا يرجعولك بالعروض."><Suspense><Form /></Suspense></RequireLogin>; }
