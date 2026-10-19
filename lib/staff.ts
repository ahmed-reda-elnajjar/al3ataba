/* Server-only: team members with limited access (e.g. someone who manages "البيع بالعمولة" but sees nothing else).
 * Staff are stored in Firestore "staff/{key}" — key = verified email (lower-case) or phone (+20…). Only the main admins
 * (ADMIN_EMAILS) can add or remove them. Access is checked on the server for every request. */
import { ADMIN_EMAILS } from "./config";
import { getDocSA } from "./sa";

const API_KEY = "AIzaSyCPXarDZxgfjpdxa6MJ8x6o2qlDcxZ-T6A"; // public web key (same as lib/firebase.ts)

export type StaffRole = "admin" | "resell";
export const STAFF_ROLES: Record<Exclude<StaffRole, "admin">, string> = { resell: "مدير البيع بالعمولة" };
export type Staff = { id: string; key: string; name: string; role: Exclude<StaffRole, "admin">; addedBy?: string; addedAt?: number };

/** Normalise an email or Egyptian phone into the staff key. */
export function staffKey(raw: string): string | null {
  const s = String(raw || "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
  const d = s.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, "");
  if (/^01[0125]\d{8}$/.test(d)) return `+2${d}`;
  if (/^201[0125]\d{8}$/.test(d)) return `+${d}`;
  return null;
}
const docId = (key: string) => key.replace(/[\/#?]/g, "_");

async function lookup(idToken: string) {
  if (!idToken) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }).catch(() => null);
  const u = r?.ok ? (await r.json())?.users?.[0] : null;
  if (!u?.localId) return null;
  return { uid: String(u.localId), email: u.emailVerified ? String(u.email || "").toLowerCase() : "", phone: String(u.phoneNumber || "") };
}

/** The role behind an ID token: "admin" (main admins), a staff role, or null. */
export async function roleFromToken(idToken: string): Promise<{ role: StaffRole; uid: string; who: string; name?: string } | null> {
  const u = await lookup(idToken);
  if (!u) return null;
  if (u.email && ADMIN_EMAILS.includes(u.email)) return { role: "admin", uid: u.uid, who: u.email };
  for (const key of [u.email, u.phone].filter(Boolean)) {
    const s = await getDocSA<Staff>(`staff/${docId(key)}`).catch(() => null);
    if (s?.role) return { role: s.role, uid: u.uid, who: key, name: s.name };
  }
  return null;
}
export const staffDocId = docId;
