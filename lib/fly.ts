/** "Fly to cart" animation: a copy of the product image arcs from `from` into `to`, then `to` bumps. */
export function flyTo(from: Element | null | undefined, to: Element | null | undefined) {
  if (typeof window === "undefined" || !from || !to) return;
  const bump = () => to.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { bump(); return; }
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  if (!a.width || !b.width) { bump(); return; }
  const img = from.querySelector("img") as HTMLImageElement | null;
  const el = document.createElement("div");
  const size = Math.min(a.width, a.height, 160);
  Object.assign(el.style, {
    position: "fixed", zIndex: "9999", pointerEvents: "none", left: `${a.left + a.width / 2 - size / 2}px`, top: `${a.top + a.height / 2 - size / 2}px`,
    width: `${size}px`, height: `${size}px`, borderRadius: "16px", background: img?.src ? `#fff url("${img.currentSrc || img.src}") center/contain no-repeat` : "var(--gold)",
    boxShadow: "0 10px 30px #0004", border: "2px solid #fff",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = el.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) scale(.7)`, opacity: 1, offset: 0.4 },
    { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0.5 },
  ], { duration: 800, easing: "cubic-bezier(.45,.05,.55,.95)" });
  anim.onfinish = () => { el.remove(); bump(); };
}
