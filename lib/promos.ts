import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { dbI } from "./firebase";
import { withId } from "./store";
import type { Promo } from "./types";
import { catalog, touchCatalog } from "./catalogClient";

/* ---------- reads / writes ---------- */
let cache: { at: number; p: Promise<Promo[]> } | null = null;
export function listPromos(fresh = false): Promise<Promo[]> {
  if (fresh || !cache || Date.now() - cache.at > 5 * 60_000) {
    cache = {
      at: Date.now(),
      p: (fresh ? Promise.resolve(null) : catalog()).then((c) => c ? c.promos : getDocs(collection(dbI(), "promos"))
        .then((s) => s.docs.map((d) => withId<Promo>(d)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))))
        .catch(() => { cache = null; return [] as Promo[]; }),
    };
  }
  return cache.p;
}
export const savePromo = async (id: string | null, data: Omit<Promo, "id">) => {
  cache = null;
  if (id) await updateDoc(doc(dbI(), "promos", id), { ...data, updatedAt: serverTimestamp() });
  else await addDoc(collection(dbI(), "promos"), { ...data, createdAt: serverTimestamp() });
  touchCatalog();
};
export const deletePromo = async (id: string) => { cache = null; await deleteDoc(doc(dbI(), "promos", id)); touchCatalog(); };

export * from "./promoCore";
