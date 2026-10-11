"use client";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { dbI } from "./firebase";

/** Internal suppliers (e.g. "الوزير"): visible to admins only (firestore.rules → /suppliers is admin-only).
 *  Products only carry an opaque supplierId, so customers never see who the supplier is. */
export type Supplier = { id: string; name: string; phone?: string };

export async function listSuppliers(): Promise<Supplier[]> {
  const s = await getDocs(collection(dbI(), "suppliers"));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Supplier, "id">) })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
export async function createSupplier(name: string, phone = ""): Promise<Supplier> {
  const ref = await addDoc(collection(dbI(), "suppliers"), { name: name.trim(), phone: phone.trim(), createdAt: serverTimestamp() });
  return { id: ref.id, name: name.trim(), phone };
}
