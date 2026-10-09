"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Swipeable product gallery (scroll-snap) + full-screen viewer. Works with touch, mouse wheel/trackpad, arrows and keyboard. */
function useSlider(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const onScroll = useCallback(() => {
    const el = ref.current; if (!el) return;
    setI(Math.max(0, Math.min(count - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth))));
  }, [count]);
  const go = useCallback((n: number, smooth = true) => {
    const el = ref.current; if (!el) return;
    const k = Math.max(0, Math.min(count - 1, n));
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollTo({ left: (rtl ? -1 : 1) * k * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    setI(k);
  }, [count]);
  return { ref, i, onScroll, go };
}

export function Gallery({ images, children }: { images: string[]; children?: React.ReactNode }) {
  const list = images.length ? images : [""];
  const main = useSlider(list.length);
  const [open, setOpen] = useState(false);
  const full = useSlider(list.length);

  useEffect(() => { main.go(0, false); /* new product */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.join("|")]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => full.go(main.i, false));
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { main.go(full.i, false); setOpen(false); }
      if (e.key === "ArrowLeft") full.go(full.i + 1);   // RTL: left = next
      if (e.key === "ArrowRight") full.go(full.i - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, full.i]);
  const close = () => { main.go(full.i, false); setOpen(false); };

  return (
    <div>
      <div style={{ position: "relative" }}>
      {children}
      <div className="gsl" ref={main.ref} onScroll={main.onScroll}>
        {list.map((src, k) => (
          <button type="button" key={k} className="gsl-it" onClick={() => src && setOpen(true)} aria-label="تكبير الصورة">
            {src ? <img src={src} alt="" loading={k ? "lazy" : "eager"} draggable={false} /> : <i className="ph ph-package" />}
          </button>
        ))}
      </div>
      {list.length > 1 && (
        <>
          <button type="button" className="gnav prev hm" onClick={() => main.go(main.i - 1)} disabled={main.i === 0} aria-label="السابقة"><i className="ph ph-caret-right" /></button>
          <button type="button" className="gnav next hm" onClick={() => main.go(main.i + 1)} disabled={main.i === list.length - 1} aria-label="التالية"><i className="ph ph-caret-left" /></button>
          <span className="gcount">{main.i + 1} / {list.length}</span>
        </>
      )}
      </div>
      {list.length > 1 && (
        <>
          <div className="dots" style={{ marginTop: 10 }}>{list.map((_, k) => <i key={k} className={k === main.i ? "on" : ""} style={{ background: k === main.i ? "var(--gold)" : "var(--bd)" }} />)}</div>
          <div className="gal">{list.map((s, k) => <button type="button" key={k} className={k === main.i ? "on" : ""} onClick={() => main.go(k)}><span className="img" style={{ aspectRatio: "1" }}><img src={s} alt="" /></span></button>)}</div>
        </>
      )}
      {open && (
        <div className="lb" role="dialog" aria-label="عرض الصور">
          <div className="lb-top"><span>{full.i + 1} / {list.length}</span><button type="button" onClick={close} aria-label="إغلاق"><i className="ph ph-x" /></button></div>
          <div className="lb-sl" ref={full.ref} onScroll={full.onScroll}>
            {list.map((src, k) => <div key={k} className="lb-it"><img src={src} alt="" draggable={false} /></div>)}
          </div>
          {list.length > 1 && (
            <>
              <button type="button" className="gnav prev" onClick={() => full.go(full.i - 1)} disabled={full.i === 0} aria-label="السابقة"><i className="ph ph-caret-right" /></button>
              <button type="button" className="gnav next" onClick={() => full.go(full.i + 1)} disabled={full.i === list.length - 1} aria-label="التالية"><i className="ph ph-caret-left" /></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
