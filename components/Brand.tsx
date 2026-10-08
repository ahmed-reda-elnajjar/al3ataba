import Link from "next/link";

/* Arch gateway mark (original drawing for العتبة أونلاين). */
export function Mark({ size = 40, light = false }: { size?: number; light?: boolean }) {
  const g = light ? "#f4eee2" : "#0f4535";
  const inner = light ? "#0a3427" : "#faf7f0";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 2 l2.2 4.2 h-4.4z" fill="#c9a66b" />
      <path d="M24 12 a8 6 0 0 1 16 0z" fill="#c9a66b" />
      <path d="M8 60 V30 C8 17 19 11 32 11 C45 11 56 17 56 30 V60 Z" fill={g} />
      <path d="M19 60 V33 C19 25 25 21 32 21 C39 21 45 25 45 33 V60 Z" fill={inner} />
      <path d="M23 60 V35 C23 29.5 27 26 32 26 C37 26 41 29.5 41 35 V60" fill="none" stroke="#c9a66b" strokeWidth="1.6" />
      <rect x="4" y="58" width="56" height="4" rx="1.5" fill="#c9a66b" />
    </svg>
  );
}

export function Logo({ light = false, size = 38, href = "/", onClick }: { light?: boolean; size?: number; href?: string; onClick?: () => void }) {
  return (
    <Link href={href} className={`logo${light ? " light" : ""}`} onClick={onClick} aria-label="العتبة أونلاين">
      <Mark size={size} light={light} />
      <span className="lt"><b>العتبة أونلاين</b><small>ATABA ONLINE</small></span>
    </Link>
  );
}

/* Big centred logo for splash / auth screens */
export function LogoBig({ light = false }: { light?: boolean }) {
  return (
    <div className="col" style={{ alignItems: "center", gap: 6 }}>
      <Mark size={86} light={light} />
      <b style={{ font: "700 30px Alexandria,sans-serif", color: light ? "#fff" : "var(--pd)" }}>العتبة أونلاين</b>
      <small style={{ letterSpacing: ".4em", fontWeight: 600, color: light ? "var(--gold2)" : "var(--gold)", fontSize: 11 }}>ATABA ONLINE</small>
    </div>
  );
}

/* Line-art skyline of an old Cairo market street (domes, minarets, arches). Uses currentColor. */
export function Skyline({ className = "sky", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 600 130" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M0 128 H600" />
      {/* minaret left */}
      <path d="M40 128 V58 H52 V128 M38 58 h16 M41 58 V44 h10 V58 M43 44 l3 -16 l3 16 M46 28 v-6" />
      <path d="M40 80 h12 M40 100 h12" />
      {/* big dome mosque */}
      <path d="M70 128 V84 H170 V128" />
      <path d="M86 84 C86 56 154 56 154 84" />
      <path d="M120 58 v-10 M117 50 h6" />
      <path d="M84 128 V106 a8 8 0 0 1 16 0 V128 M112 128 V100 a8 8 0 0 1 16 0 V128 M140 128 V106 a8 8 0 0 1 16 0 V128" />
      {/* market arcade */}
      <path d="M180 128 V92 H300 V128" />
      <path d="M186 128 V110 a9 9 0 0 1 18 0 V128 M210 128 V110 a9 9 0 0 1 18 0 V128 M234 128 V110 a9 9 0 0 1 18 0 V128 M258 128 V110 a9 9 0 0 1 18 0 V128 M282 128 V112 a7 7 0 0 1 12 0 V128" />
      <path d="M180 92 l10 -10 h100 l10 10" />
      <path d="M196 98 h8 M220 98 h8 M244 98 h8 M268 98 h8" />
      {/* tall minaret centre */}
      <path d="M318 128 V48 H332 V128 M315 48 h20 M319 48 V30 h12 V48 M321 30 l4 -20 l4 20 M325 10 v-6" />
      <path d="M318 70 h14 M318 96 h14" />
      {/* domes cluster */}
      <path d="M350 128 V96 H440 V128" />
      <path d="M358 96 C358 76 392 76 392 96 M398 96 C398 70 436 70 436 96" />
      <path d="M375 79 v-7 M417 73 v-9" />
      <path d="M362 128 V114 a6 6 0 0 1 12 0 V128 M386 128 V114 a6 6 0 0 1 12 0 V128 M410 128 V114 a6 6 0 0 1 12 0 V128" />
      {/* houses with mashrabiya */}
      <path d="M452 128 V86 H500 V128 M462 96 h12 v12 h-12z M480 96 h12 v12 h-12z M470 128 v-12 h12 v12" />
      <path d="M506 128 V74 H548 V128 M514 84 h10 v10 h-10z M530 84 h10 v10 h-10z M514 102 h26" />
      {/* small minaret right */}
      <path d="M560 128 V66 H570 V128 M558 66 h14 M561 66 V54 h8 V66 M563 54 l2 -12 l2 12" />
      <path d="M576 128 V100 H600" />
    </svg>
  );
}

/* Simple market-stall + phone illustration for onboarding */
export function MarketArt() {
  return (
    <svg viewBox="0 0 260 180" width="100%" style={{ maxWidth: 300 }} aria-hidden="true">
      <circle cx="130" cy="96" r="78" fill="#f1e6d1" />
      <rect x="40" y="70" width="110" height="80" rx="6" fill="#fff" stroke="#0f4535" strokeWidth="2" />
      <path d="M34 70 L46 44 H144 L156 70 Z" fill="#0f4535" />
      <path d="M46 44 L52 70 M70 44 L72 70 M95 44 V70 M120 44 L118 70 M144 44 L138 70" stroke="#c9a66b" strokeWidth="2" />
      <path d="M34 70 a9 7 0 0 0 18 0 a9 7 0 0 0 20 0 a9 7 0 0 0 23 0 a9 7 0 0 0 23 0 a9 7 0 0 0 20 0 a9 7 0 0 0 18 0" fill="#c9a66b" />
      <rect x="54" y="100" width="22" height="20" rx="3" fill="#c9a66b" /><rect x="80" y="94" width="26" height="26" rx="3" fill="#b08a4f" /><rect x="110" y="104" width="24" height="16" rx="3" fill="#d9c39b" />
      <rect x="54" y="122" width="80" height="4" rx="2" fill="#0f4535" />
      <rect x="164" y="54" width="62" height="108" rx="12" fill="#0a3427" />
      <rect x="170" y="64" width="50" height="86" rx="6" fill="#faf7f0" />
      <path d="M182 92 h6 l6 20 h18 l5 -14 h-26" fill="none" stroke="#0f4535" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="197" cy="118" r="3" fill="#0f4535" /><circle cx="210" cy="118" r="3" fill="#0f4535" />
      <circle cx="214" cy="78" r="9" fill="#c9a66b" /><path d="M210 78 l3 3 l5 -6" stroke="#fff" strokeWidth="2" fill="none" />
    </svg>
  );
}
