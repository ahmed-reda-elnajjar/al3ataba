"use client";
import { useEffect, useState } from "react";

// Favourites are kept on this device only (localStorage).
const K = "al3ataba-favs";
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(K) || "[]"); } catch { return []; } };

export function useFavs() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(read());
    const on = () => setIds(read());
    window.addEventListener("favs", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("favs", on); window.removeEventListener("storage", on); };
  }, []);
  const toggle = (id: string) => {
    const cur = read();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
    try { localStorage.setItem(K, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event("favs"));
  };
  return { ids, has: (id: string) => ids.includes(id), toggle };
}
