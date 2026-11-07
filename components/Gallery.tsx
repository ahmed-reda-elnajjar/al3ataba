"use client";
import { sized } from "@/lib/media";
import { isVideoUrl, videoPoster } from "@/lib/img";
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

const isVid = (u: string) => u.startsWith("vid:");
const src = (u: string) => (isVid(u) ? u.slice(4) : u);
const posterOf = (u: string) => videoPoster(src(u));

export function Gallery({ images, videos = [], order, children }: { images: string[]; videos?: string[]; order?: string[]; children?: React.ReactNode }) {
  const media = order?.length ? order.map((u) => (isVideoUrl(u) ? "vid:" + u : u)) : [...images.filter((u) => !isVideoUrl(u)), ...[...videos, ...images.filter(isVideoUrl)].map((v) => "vid:" + v)];
  const list = media.length ? media : [""];
  const main = useSlider(list.length);
  const [open, setOpen] = useState(false);
  // each video keeps its own frame shape (e.g. 9:16 reels) instead of being squeezed into the square box
  const [ratio, setRatio] = useState<Record<number, number>>({});
  // a video whose saved cover frame is missing shows the product's first photo instead (never a broken "?" box)
  const [noPoster, setNoPoster] = useState<Record<number, boolean>>({});
  const [playing, setPlaying] = useState<Record<number, boolean>>({});
  const firstPhoto = list.find((u) => u && !isVid(u)) || "";
  const poster = (u: string, k: number) => (noPoster[k] ? firstPhoto : posterOf(u));
  // measure every photo/video (videos via their poster frame — iPhone doesn't load video metadata until play)
  useEffect(() => {
    list.forEach((u, k) => {
      if (!u) return;
      const im = new Image();
      im.onload = () => { if (im.naturalWidth && im.naturalHeight) setRatio((r) => (r[k] ? r : { ...r, [k]: im.naturalWidth / im.naturalHeight })); };
      if (isVid(u)) im.onerror = () => setNoPoster((x) => ({ ...x, [k]: true }));
      im.src = sized(isVid(u) ? posterOf(u) : u, 1000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.join("|")]);
  const raw = ratio[main.i] ?? (isVid(list[main.i] || "") ? 9 / 16 : 1);
  // one fixed square frame for every photo and video (no jumping, no giant reels); each item is shown whole inside it
  const curRatio = raw > 0 ? 1 : 1;
  // the frame width can change with the ratio; keep the current slide aligned
  useEffect(() => { requestAnimationFrame(() => main.go(main.i, false)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curRatio]);
  const full = useSlider(list.length);

  useEffect(() => { main.go(0, false); /* new product */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.join("|")]);
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
      <div className="gsl" ref={main.ref} onScroll={main.onScroll} style={{ aspectRatio: String(curRatio), width: `min(100%, 62vh)` }}>
        {list.map((u, k) => isVid(u) ? (
          <div key={k} className="gsl-it vid">
            {playing[k] || !poster(u, k)
              ? <video src={playing[k] ? src(u) : `${src(u)}#t=0.1`} autoPlay={!!playing[k]} controls playsInline preload="metadata" />
              : <button type="button" onClick={() => setPlaying((x) => ({ ...x, [k]: true }))} aria-label="تشغيل الفيديو" style={{ all: "unset", position: "relative", width: "100%", height: "100%", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  {/* iPhone stretches a video's poster to fill the box, so the cover is a normal picture until play */}
                  <img src={sized(poster(u, k), 1000)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                  <span style={{ position: "absolute", width: 64, height: 64, borderRadius: "50%", background: "#000a", color: "#fff", display: "grid", placeItems: "center" }}><i className="ph-fill ph-play" style={{ fontSize: 30, color: "#fff" }} /></span>
                </button>}
          </div>
        ) : (
          <button type="button" key={k} className="gsl-it" onClick={() => u && setOpen(true)} aria-label="تكبير الصورة">
            {u ? <img src={sized(u, 1000)} alt="" loading={k ? "lazy" : "eager"} draggable={false} /> : <i className="ph ph-package" />}
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
          <div className="gal">{list.map((u, k) => <button type="button" key={k} className={k === main.i ? "on" : ""} onClick={() => main.go(k)}><span className="img" style={{ aspectRatio: "1" }}>{isVid(u) && !poster(u, k) ? <video src={`${src(u)}#t=0.1`} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={sized(isVid(u) ? poster(u, k) : u, 160)} alt="" loading="lazy" />}{isVid(u) && <i className="ph ph-play-circle gplay" />}</span></button>)}</div>
        </>
      )}
      {open && (
        <div className="lb" role="dialog" aria-label="عرض الصور">
          <div className="lb-top"><span>{full.i + 1} / {list.length}</span><button type="button" onClick={close} aria-label="إغلاق"><i className="ph ph-x" /></button></div>
          <div className="lb-sl" ref={full.ref} onScroll={full.onScroll}>
            {list.map((u, k) => <div key={k} className="lb-it">{isVid(u) ? <video src={`${src(u)}#t=0.1`} poster={poster(u, k) || undefined} controls playsInline preload="metadata" /> : <img src={u} alt="" draggable={false} />}</div>)}
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
