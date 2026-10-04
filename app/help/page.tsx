"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/lib/providers";
import { waLink } from "@/lib/format";

const FAQ = [
  ["إزاي أشتري من العتبة؟", "ابحث عن المنتج، اختار الكمية (الأسعار بتتغير حسب الكمية)، أضفه للسلة وكمّل الطلب. الطلب بيوصل للتاجر وبيتواصل معاك للتأكيد."],
  ["إيه هو طلب عرض السعر؟", "لو محتاج كمية كبيرة أو منتج مخصوص، اكتب طلبك وهيوصل للتجار المسجّلين وكل واحد يبعتلك عرضه. تقارن وتقبل الأنسب."],
  ["إزاي أدفع؟", "الدفع عند الاستلام (لو المنتج بيقبله) أو تحويل على إنستاباي / فودافون كاش / حساب بنكي، وتفاصيل التحويل بتظهر لك بعد تأكيد الطلب."],
  ["إزاي أبيع على العتبة؟", "من صفحة «بيع معانا» سجّل متجرك، وبعد مراجعة فريق العتبة تقدر تضيف منتجاتك وتستقبل الطلبات."],
  ["إيه معنى «موثّق»؟", "يعني فريق العتبة راجع بيانات التاجر (سجل تجاري وبطاقة ضريبية)."],
  ["إزاي ألغي أو أتابع طلبي؟", "من «حسابي» ← «طلباتي». تقدر تلغي الطلب طالما لسه جديد ولم يؤكده التاجر."],
];

export default function Help() {
  const { settings } = useApp();
  const [q, setQ] = useState("");
  const list = FAQ.filter(([a, b]) => !q.trim() || (a + b).includes(q.trim()));
  return (
    <div className="wc" style={{ maxWidth: 820 }}>
      <h1>مركز المساعدة</h1>
      <div className="srch mt"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب سؤالك" aria-label="اكتب سؤالك" /><button aria-label="بحث"><i className="ph ph-magnifying-glass" /></button></div>
      <div className="col mt">
        {list.map(([a, b]) => <details key={a} className="card"><summary style={{ cursor: "pointer", fontWeight: 600 }}>{a}</summary><p className="mu" style={{ marginTop: 8 }}>{b}</p></details>)}
        {!list.length && <p className="mu">مفيش إجابة مطابقة، كلّمنا مباشرة.</p>}
      </div>
      <div className="card row wrap mt2">
        <div className="sp"><b>لسه محتاج مساعدة؟</b><p className="mu">فريق الدعم جاهز يرد عليك.</p></div>
        {settings.whatsapp && <a className="btn" href={waLink(settings.whatsapp)} target="_blank" rel="noreferrer"><i className="ph ph-whatsapp-logo" />واتساب</a>}
        <Link href="/rfq" className="btn o">اطلب عرض سعر</Link>
      </div>
    </div>
  );
}
