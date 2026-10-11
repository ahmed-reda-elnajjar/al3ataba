"use client";
import { useEffect, useRef, useState } from "react";

type Box = { x: number; y: number; w: number; h: number };
type Mode = "move" | "nw" | "ne" | "sw" | "se" | "new";
const RATIOS: [string, number][] = [["حر", 0], ["مربع 1:1", 1], ["طولي 4:5", 4 / 5], ["طولي 3:4", 3 / 4], ["عرضي 16:9", 16 / 9]];

/** Loads an image so it can be drawn to a canvas (CORS). Rejects if the host doesn't allow it. */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    if (!src.startsWith("data:")) im.crossOrigin = "anonymous";
    im.onload = () => res(im); im.onerror = () => rej(new Error("load"));
    im.src = src;
  });
}

/**
 * Full-screen image cropper (mouse + touch). Calls onDone with the cropped picture as a JPEG File.
 * `prepare` can return a CORS-friendly copy of the URL when the original host blocks canvas access.
 */
export function Cropper({ src, onCancel, onDone, prepare }: { src: string; onCancel: () => void; onDone: (f: File) => Promise<void> | void; prepare?: (src: string) => Promise<string> }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState("");
  const [ratio, setRatio] = useState(0);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const live = useRef(box); live.current = box;

  useEffect(() => {
    let ok = true;
    (async () => {
      try { const im = await loadImg(src); if (ok) setImg(im); }
      catch {
        try { if (!prepare) throw 0; const copy = await prepare(src); const im = await loadImg(copy); if (ok) setImg(im); }
        catch { if (ok) setErr("مقدرناش نفتح الصورة للقص. احذفها وارفعها تاني من جهازك وبعدين قصّها."); }
      }
    })();
    document.body.style.overflow = "hidden";
    return () => { ok = false; document.body.style.overflow = ""; };
  }, [src, prepare]);

  // displayed size of the image
  const dims = () => { const el = wrap.current?.querySelector("img"); return el ? { w: el.clientWidth, h: el.clientHeight, r: el.getBoundingClientRect() } : null; };
  useEffect(() => { // initial box: 90% centred
    if (!img) return;
    requestAnimationFrame(() => { const d = dims(); if (!d) return; const w = d.w * 0.9, h = d.h * 0.9; setBox({ x: (d.w - w) / 2, y: (d.h - h) / 2, w, h }); });
  }, [img]);
  useEffect(() => { // apply a ratio preset
    if (!ratio) return; const d = dims(); if (!d) return;
    let w = Math.min(d.w, d.h * ratio) * 0.9, h = w / ratio;
    if (h > d.h) { h = d.h * 0.9; w = h * ratio; }
    setBox({ x: (d.w - w) / 2, y: (d.h - h) / 2, w, h });
  }, [ratio]);

  const start = (mode: Mode, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const d = dims(); if (!d) return;
    const b0 = { ...live.current };
    const px = e.clientX - d.r.left, py = e.clientY - d.r.top;
    const clamp = (v: number, a: number, z: number) => Math.max(a, Math.min(z, v));
    const move = (ev: PointerEvent) => {
      const x = clamp(ev.clientX - d.r.left, 0, d.w), y = clamp(ev.clientY - d.r.top, 0, d.h);
      let b: Box;
      if (mode === "move") b = { ...b0, x: clamp(b0.x + x - px, 0, d.w - b0.w), y: clamp(b0.y + y - py, 0, d.h - b0.h) };
      else {
        // fixed corner opposite to the one being dragged
        const fx = mode === "new" ? px : mode === "nw" || mode === "sw" ? b0.x + b0.w : b0.x;
        const fy = mode === "new" ? py : mode === "nw" || mode === "ne" ? b0.y + b0.h : b0.y;
        let w = Math.abs(x - fx), h = Math.abs(y - fy);
        if (ratio) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
        b = { x: x < fx ? fx - w : fx, y: y < fy ? fy - h : fy, w, h };
        b.x = clamp(b.x, 0, d.w - b.w); b.y = clamp(b.y, 0, d.h - b.h);
      }
      if (b.w > 8 && b.h > 8) setBox(b);
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  };

  const crop = async () => {
    const d = dims(); if (!img || !d) return;
    const sx = img.naturalWidth / d.w, sy = img.naturalHeight / d.h;
    const c = document.createElement("canvas");
    c.width = Math.round(box.w * sx); c.height = Math.round(box.h * sy);
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, box.x * sx, box.y * sy, box.w * sx, box.h * sy, 0, 0, c.width, c.height);
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.93));
      await onDone(new File([blob], `crop-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch { setErr("حصلت مشكلة وإحنا بنقص الصورة."); setBusy(false); }
  };

  const H = (m: Mode, s: React.CSSProperties) => <span className="crh" style={s} onPointerDown={(e) => start(m, e)} />;
  return (
    <div className="crop" role="dialog" aria-label="قص الصورة">
      <div className="row wrap" style={{ justifyContent: "center" }}>
        {RATIOS.map(([t, r]) => <button key={t} type="button" className={`chip${ratio === r ? " on" : ""}`} onClick={() => setRatio(r)}>{t}</button>)}
      </div>
      <div className="crop-stage">
        {err ? <div className="alert e">{err}</div> : !img ? <div className="mu" style={{ color: "#fff" }}>جاري تحميل الصورة…</div> : (
          <div ref={wrap} className="crop-wrap" onPointerDown={(e) => start("new", e)}>
            <img src={img.src} alt="" draggable={false} />
            <div className="crop-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onPointerDown={(e) => start("move", e)}>
              {H("nw", { top: -9, left: -9, cursor: "nwse-resize" })}{H("ne", { top: -9, right: -9, cursor: "nesw-resize" })}
              {H("sw", { bottom: -9, left: -9, cursor: "nesw-resize" })}{H("se", { bottom: -9, right: -9, cursor: "nwse-resize" })}
            </div>
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn o" onClick={onCancel} disabled={busy}>إلغاء</button>
        <button type="button" className="btn gd" onClick={crop} disabled={!img || busy || !box.w}><i className="ph ph-crop" />{busy ? "جاري الحفظ…" : "قص وحفظ"}</button>
      </div>
      <small style={{ color: "#ddd", textAlign: "center" }}>اسحب المربع لتحريكه، والأركان لتكبيره أو تصغيره، أو ارسم مربع جديد في أي مكان.</small>
    </div>
  );
}
