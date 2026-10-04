"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Tiny data-loading hook: runs `fn` on mount / dep change, exposes reload().
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string }>({ loading: true });
  const [tick, setTick] = useState(0);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    ref.current().then((data) => live && setState({ data, loading: false }), (e) => live && setState({ loading: false, error: String(e?.message || e) }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { ...state, reload };
}
