"use client";
import type { MarkupTier } from "@/lib/pricing";

/** Editor for quantity-based markup: "from N pieces → +X%". */
export function MarkupEditor({ value, onChange }: { value: MarkupTier[]; onChange: (v: MarkupTier[]) => void }) {
  const set = (i: number, k: keyof MarkupTier, v: string) => onChange(value.map((x, j) => (j === i ? { ...x, [k]: Number(v.replace(/[^\d.]/g, "")) || 0 } : x)));
  return (
    <div className="col g8">
      {value.map((x, i) => (
        <div key={i} className="row wrap g8">
          <span>من</span>
          <input className="in" style={{ width: 80 }} inputMode="numeric" value={x.min || ""} onChange={(e) => set(i, "min", e.target.value)} aria-label="من كمية" />
          <span>قطعة ←</span>
          <span>زيادة</span>
          <input className="in" style={{ width: 80 }} inputMode="decimal" value={String(x.pct)} onChange={(e) => set(i, "pct", e.target.value)} aria-label="النسبة" />
          <span>%</span>
          {value.length > 1 && <button type="button" className="btn r sm2" onClick={() => onChange(value.filter((_, j) => j !== i))}>حذف</button>}
        </div>
      ))}
      {value.length < 6 && <button type="button" className="btn o sm2" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...value, { min: (value[value.length - 1]?.min || 0) * 2 || 1, pct: 0 }])}>+ شريحة كمية</button>}
      <small>مثال: من 1 قطعة +10% و من 5 قطع +5% ← اللي بيشتري قطعة بياخدها بسعر أعلى، واللي بيشتري 5 أو أكتر بسعر أقل. أقل كمية للطلب = أول شريحة.</small>
    </div>
  );
}
