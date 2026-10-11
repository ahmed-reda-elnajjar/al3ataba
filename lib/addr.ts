"use client";
import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { dbI } from "./firebase";
import { useApp } from "./providers";

/** The shopper's delivery area (header line + checkout prefill). Kept on the device, and in profiles/{uid} when signed in. */
export type Addr = { governorate: string; city: string };
const K = "al3ataba-addr";
const read = (): Addr | null => { try { const a = JSON.parse(localStorage.getItem(K) || "null"); return a?.governorate ? a : null; } catch { return null; } };

export function useAddr() {
  const { user, loggedIn } = useApp();
  const [addr, setAddr] = useState<Addr | null>(null);
  useEffect(() => {
    const r = () => setAddr(read());
    r();
    window.addEventListener("addr", r);
    return () => window.removeEventListener("addr", r);
  }, []);
  // signed in on a new device: pull the saved address once
  useEffect(() => {
    if (!loggedIn || !user || read()) return;
    getDoc(doc(dbI(), "profiles", user.uid)).then((s) => {
      const a = s.data()?.addr as Addr | undefined;
      if (a?.governorate) { try { localStorage.setItem(K, JSON.stringify(a)); } catch {} window.dispatchEvent(new Event("addr")); }
    }).catch(() => {});
  }, [loggedIn, user]);
  const save = useCallback((a: Addr) => {
    try { localStorage.setItem(K, JSON.stringify(a)); } catch {}
    window.dispatchEvent(new Event("addr"));
    if (loggedIn && user) setDoc(doc(dbI(), "profiles", user.uid), { addr: a }, { merge: true }).catch(() => {});
  }, [loggedIn, user]);
  return { addr, save };
}
