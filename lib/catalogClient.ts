/* Browser side of the cached catalogue (/api/catalog). Visitors read products/categories/offers from it instead of Firebase.
 * Admins bypass it (they always see live data), and their edits ask the server to refresh it. */
import type { User } from "firebase/auth";
import type { Catalog } from "./catalog";
import { authI } from "./firebase";
import { registerCats } from "./cats";

let bypass = false;
let cache: { at: number; p: Promise<Catalog | null> } | null = null;

export const setCatalogBypass = (v: boolean) => { bypass = v; };

/** The cached catalogue, or null (admin, or it failed) → callers fall back to reading Firebase directly. */
export function catalog(): Promise<Catalog | null> {
  if (bypass || typeof window === "undefined") return Promise.resolve(null);
  if (!cache || Date.now() - cache.at > 10 * 60_000) {
    cache = {
      at: Date.now(),
      p: fetch("/api/catalog").then((r) => (r.ok ? r.json() : null)).then((c: Catalog | null) => (c && Array.isArray(c.products) ? c : null))
        .catch(() => null).then((c) => { if (!c) cache = null; else registerCats(c.categories); return c; }),
    };
  }
  return cache.p;
}

/* ---- admin: tell the server something changed (debounced; the server also throttles) ---- */
let timer: ReturnType<typeof setTimeout> | null = null;
let who: User | null = null;
export function touchCatalog(user: User | null | undefined = undefined) {
  if (typeof window === "undefined") return;
  user = user || authI().currentUser;
  if (!user) return;
  who = user;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void refreshCatalog(who!); }, 20_000);
}
/** Returns seconds to wait when the server says "too soon" (0 = refreshed). Retries once by itself after the wait. */
export async function refreshCatalog(user: User, force = false): Promise<number> {
  try {
    const r = await fetch(`/api/catalog${force ? "?force=1" : ""}`, { method: "POST", headers: { "x-firebase-token": await user.getIdToken() } });
    const j = await r.json().catch(() => ({}));
    if (j.ok) return 0;
    const wait = Number(j.wait) || 0;
    if (wait > 0 && !timer) timer = setTimeout(() => { timer = null; void refreshCatalog(user); }, (wait + 5) * 1000);
    return wait;
  } catch { return -1; }
}
