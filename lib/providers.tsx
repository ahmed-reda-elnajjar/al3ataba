"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInAnonymously, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { authI, dbI } from "./firebase";
import { ADMIN_EMAILS, DEFAULT_SETTINGS } from "./config";
import { getSettings } from "./store";
import type { CartItem, Merchant, Settings } from "./types";

type Ctx = {
  user: User | null; ready: boolean; loggedIn: boolean; isAdmin: boolean;
  merchant: Merchant | null; settings: Settings;
  items: CartItem[]; count: number;
  add: (i: CartItem) => void; remove: (id: string) => void; setQty: (id: string, q: number) => void; clear: () => void;
  signOut: () => Promise<void>;
};

const AppCtx = createContext<Ctx>({
  user: null, ready: false, loggedIn: false, isAdmin: false, merchant: null, settings: DEFAULT_SETTINGS,
  items: [], count: 0, add() {}, remove() {}, setQty() {}, clear() {}, signOut: async () => {},
});
export const useApp = () => useContext(AppCtx);

const LS = "al3ataba-cart";
const readLS = (): CartItem[] => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };

// Anonymous Firebase auth gives every visitor a stable uid so the cart can live in carts/{uid}.
// Signing in later keeps the cart: the local copy is pushed to the new uid when its cloud cart is empty.
export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const cloud = useRef(false);

  useEffect(() => { getSettings().then(setSettings); }, []);

  useEffect(() => {
    const auth = authI();
    return onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setReady(true); return; }
      signInAnonymously(auth).catch(() => { setUser(null); setReady(true); });
    });
  }, []);

  const loggedIn = !!user && !user.isAnonymous;
  const isAdmin = loggedIn && !!user?.emailVerified && ADMIN_EMAILS.includes((user?.email || "").toLowerCase());

  useEffect(() => {
    if (!ready) return;
    const local = () => { cloud.current = false; setItems(readLS()); };
    if (!user) { local(); return; }
    cloud.current = true;
    return onSnapshot(
      doc(dbI(), "carts", user.uid),
      (s) => {
        const remote = (s.data()?.items as CartItem[]) ?? [];
        const mine = readLS();
        if (!remote.length && mine.length) {
          setItems(mine);
          setDoc(doc(dbI(), "carts", user.uid), { items: mine, updatedAt: serverTimestamp() }).catch(() => { cloud.current = false; });
        } else setItems(remote);
      },
      local,
    );
  }, [ready, user]);

  useEffect(() => {
    if (!loggedIn || !user) { setMerchant(null); return; }
    return onSnapshot(doc(dbI(), "merchants", user.uid), (s) => setMerchant(s.exists() ? ({ id: s.id, ...s.data() } as Merchant) : null), () => setMerchant(null));
  }, [loggedIn, user]);

  const save = useCallback((next: CartItem[]) => {
    setItems(next);
    try { localStorage.setItem(LS, JSON.stringify(next)); } catch {}
    if (cloud.current && user) {
      setDoc(doc(dbI(), "carts", user.uid), { items: next, updatedAt: serverTimestamp() }).catch(() => { cloud.current = false; });
    }
  }, [user]);

  const value = useMemo<Ctx>(() => ({
    user, ready, loggedIn, isAdmin, merchant, settings, items, count: items.length,
    add: (i) => save(items.some((x) => x.id === i.id) ? items.map((x) => (x.id === i.id ? i : x)) : [...items, i]),
    remove: (id) => save(items.filter((x) => x.id !== id)),
    setQty: (id, q) => save(items.map((x) => (x.id === id ? { ...x, qty: q } : x))),
    clear: () => save([]),
    signOut: async () => { try { localStorage.removeItem(LS); } catch {} await fbSignOut(authI()); },
  }), [user, ready, loggedIn, isAdmin, merchant, settings, items, save]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
