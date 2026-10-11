"use client";
import type { MarkupTier, PriceRule } from "@/lib/pricing";

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
    </div>
  );
}

/** Price bands, each with its own quantity tiers. The band is chosen by the ORIGINAL piece price. */
export function RulesEditor({ value, onChange }: { value: PriceRule[]; onChange: (v: PriceRule[]) => void }) {
  const sorted = [...value].sort((a, b) => a.from - b.from);
  const setAt = (i: number, r: PriceRule) => onChange(sorted.map((x, j) => (j === i ? r : x)));
  return (
    <div className="col">
      {sorted.map((r, i) => (
        <div key={i} className="card col" style={{ background: "#fff", gap: 10 }}>
          <div className="row wrap g8">
            {i === 0 ? <b className="sp">أي سعر (الأساسي)</b> : (
              <>
                <b>لو سعر القطعة الأصلي</b>
                <input className="in" style={{ width: 100 }} inputMode="decimal" value={r.from || ""} onChange={(e) => setAt(i, { ...r, from: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} aria-label="من سعر" />
                <b className="sp">ج.م أو أكتر</b>
                <button type="button" className="btn r sm2" onClick={() => onChange(sorted.filter((_, j) => j !== i))}>حذف الشريحة</button>
              </>
            )}
          </div>
          <MarkupEditor value={r.tiers} onChange={(t) => setAt(i, { ...r, tiers: t })} />
        </div>
      ))}
      {sorted.length < 8 && <button type="button" className="btn o sm2" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...sorted, { from: (sorted[sorted.length - 1]?.from || 0) + 100, tiers: [{ min: 1, pct: 5 }] }])}>+ شريحة سعر</button>}
      <small>مثال: الأساسي 1 قطعة +10% و 5 قطع +5%، ولو السعر 500 ج.م أو أكتر: 1 قطعة +5% و 5 قطع +3%. كل منتج بياخد الشريحة المناسبة لسعره الأصلي.</small>
    </div>
  );
}
