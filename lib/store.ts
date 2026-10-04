import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { dbI } from "./firebase";
import { DEFAULT_SETTINGS } from "./config";
import { ms } from "./format";
import type { Category, Merchant, Product, Settings } from "./types";

export const withId = <T,>(d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as T;
const newest = <T extends { createdAt?: { seconds: number } }>(a: T[]) => [...a].sort((x, y) => ms(y.createdAt) - ms(x.createdAt));

export async function listActiveProducts(): Promise<Product[]> {
  const s = await getDocs(query(collection(dbI(), "products"), where("status", "==", "active"), limit(500)));
  return newest(s.docs.map((d) => withId<Product>(d)));
}
export async function getProduct(id: string): Promise<Product | null> {
  const s = await getDoc(doc(dbI(), "products", id));
  return s.exists() ? withId<Product>(s) : null;
}
export async function listMerchantProducts(merchantId: string): Promise<Product[]> {
  const s = await getDocs(query(collection(dbI(), "products"), where("merchantId", "==", merchantId), where("status", "==", "active")));
  return newest(s.docs.map((d) => withId<Product>(d)));
}
export async function listCategories(): Promise<Category[]> {
  const s = await getDocs(collection(dbI(), "categories"));
  return s.docs.map((d) => withId<Category>(d)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function listApprovedMerchants(): Promise<Merchant[]> {
  const s = await getDocs(query(collection(dbI(), "merchants"), where("status", "==", "approved")));
  return s.docs.map((d) => withId<Merchant>(d)).sort((a, b) => Number(b.verified) - Number(a.verified));
}
export async function getMerchant(id: string): Promise<Merchant | null> {
  const s = await getDoc(doc(dbI(), "merchants", id));
  return s.exists() ? withId<Merchant>(s) : null;
}
export async function getSettings(): Promise<Settings> {
  try {
    const s = await getDoc(doc(dbI(), "settings", "site"));
    return { ...DEFAULT_SETTINGS, ...(s.exists() ? (s.data() as Partial<Settings>) : {}) };
  } catch { return DEFAULT_SETTINGS; }
}
