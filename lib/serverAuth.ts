/* Server-only: check that a Firebase ID token belongs to a verified admin (no SDK needed). */
import { ADMIN_EMAILS } from "./config";

const API_KEY = "AIzaSyCPXarDZxgfjpdxa6MJ8x6o2qlDcxZ-T6A"; // public web key (same as lib/firebase.ts)

export async function isAdminToken(idToken: string) {
  if (!idToken) return false;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }).catch(() => null);
  const u = r?.ok ? (await r.json())?.users?.[0] : null;
  return !!u && u.emailVerified === true && ADMIN_EMAILS.includes(String(u.email || "").toLowerCase());
}

/** The signed-in (non-anonymous) user behind a Firebase ID token, or null. */
export async function userFromToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  if (!idToken) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }).catch(() => null);
  const u = r?.ok ? (await r.json())?.users?.[0] : null;
  if (!u?.localId || !(u.providerUserInfo?.length || u.email)) return null; // anonymous sessions can't sell
  return { uid: String(u.localId), email: String(u.email || "") };
}
