/* Main categories and sub-categories (one level): a category with `parentId` lives inside that main category.
 * A main category shows the products of all its sub-categories. */
import type { Category, Product } from "./types";

let parentOf: Record<string, string> = {};

/** Remember the tree (called whenever the category list is loaded). */
export function registerCats(cats: Category[]) {
  const ids = new Set(cats.map((c) => c.id));
  parentOf = Object.fromEntries(cats.filter((c) => c.parentId && ids.has(c.parentId) && c.parentId !== c.id).map((c) => [c.id, c.parentId!]));
}
/** Categories shown at the top level (no parent, or their parent was deleted). */
export const topCats = <T extends Category>(cats: T[]) => { const ids = new Set(cats.map((c) => c.id)); return cats.filter((c) => !c.parentId || !ids.has(c.parentId)); };
export const childrenOf = <T extends Category>(cats: T[], id: string) => cats.filter((c) => c.parentId === id && c.id !== id);
/** The category itself + its sub-categories. */
export const familyIds = (id: string, cats?: Category[]) =>
  cats ? [id, ...childrenOf(cats, id).map((c) => c.id)] : [id, ...Object.keys(parentOf).filter((k) => parentOf[k] === id)];
/** Every category a product shows in: its own, its extra ones, and their main categories. */
export function productCats(p: Pick<Product, "categoryId" | "extraCats">, cats?: Category[]) {
  const map = cats ? Object.fromEntries(cats.filter((c) => c.parentId).map((c) => [c.id, c.parentId!])) : parentOf;
  const own = [p.categoryId, ...(p.extraCats || [])];
  return Array.from(new Set([...own, ...own.map((c) => map[c]).filter(Boolean)]));
}
/** Categories as a flat list ordered main → its subs (for selects), with a depth flag. */
export function treeList<T extends Category>(cats: T[]): (T & { depth: number })[] {
  const out: (T & { depth: number })[] = [];
  for (const t of topCats(cats)) { out.push({ ...t, depth: 0 }); for (const s of childrenOf(cats, t.id)) out.push({ ...s, depth: 1 }); }
  return out;
}
