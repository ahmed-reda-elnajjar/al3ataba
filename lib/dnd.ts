"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Drag-and-drop sorting with pointer events: works with mouse AND touch (HTML5 drag events don't work on phones).
 * Put `handle(key)` props on the drag handle and `item(key)` props on each sortable element.
 * Works for vertical lists and wrapped grids (nearest-centre hit test).
 * Move/up are tracked on window, because re-ordering DOM nodes drops pointer capture.
 */
export function useDragSort<T>(items: T[], keyOf: (x: T) => string, onCommit: (next: T[]) => void) {
  const [list, setList] = useState(items);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const live = useRef(items);
  live.current = list;
  const fns = useRef({ keyOf, onCommit });
  fns.current = { keyOf, onCommit };

  // re-sync when the source data really changes (not on every new array identity)
  const sig = JSON.stringify(items);
  useEffect(() => { if (!dragKey) setList(items); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const start = (key: string, e: React.PointerEvent) => {
    if (e.button > 0) return;
    e.preventDefault();
    const k = fns.current.keyOf;
    const before = live.current.map(k).join("|");
    setDragKey(key);
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      const cur = live.current;
      const from = cur.findIndex((it) => k(it) === key);
      if (from < 0) return;
      let best = from, bestD = Infinity;
      cur.forEach((it, i) => {
        const el = els.current.get(k(it)); if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best !== from) { const a = [...cur]; const [m] = a.splice(from, 1); a.splice(best, 0, m); live.current = a; setList(a); }
      if (ev.clientY < 70) window.scrollBy(0, -12); else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 12);
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragKey(null);
      if (ev.type === "pointercancel") { setList(items); return; }
      if (live.current.map(k).join("|") !== before) fns.current.onCommit(live.current);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const handle = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => start(key, e),
    style: { touchAction: "none", cursor: dragKey === key ? "grabbing" : "grab" } as React.CSSProperties,
  });
  const item = (key: string) => ({
    ref: (el: HTMLElement | null) => { if (el) els.current.set(key, el); else els.current.delete(key); },
    "data-dragging": dragKey === key ? "1" : undefined,
  });
  return { list, dragKey, handle, item };
}
