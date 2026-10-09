// Common Arabic colour names → swatch hex (used for the little colour dots).
export const COLORS: [string, string][] = [
  ["أسود", "#111111"], ["أبيض", "#ffffff"], ["رمادي", "#8a8f94"], ["فضي", "#c0c4c8"], ["بيج", "#d9c3a0"], ["كافيه", "#6f4e37"],
  ["بني", "#7b4a2a"], ["كحلي", "#1f2a50"], ["أزرق", "#2563eb"], ["لبني", "#93c5fd"], ["أخضر", "#15803d"], ["زيتي", "#556b2f"],
  ["أحمر", "#dc2626"], ["نبيتي", "#7f1d1d"], ["بينك", "#f472b6"], ["موف", "#8b5cf6"], ["أصفر", "#facc15"], ["برتقالي", "#f97316"],
  ["ذهبي", "#c9a227"], ["شفاف", "transparent"],
];
const norm = (s: string) => s.trim().replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
export const swatch = (name: string): string | undefined => COLORS.find(([n]) => norm(n) === norm(name))?.[1];
