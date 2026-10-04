"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type PanelLink = { href: string; t: string; ic: string };

export function Panel({ title, links, children }: { title: string; links: PanelLink[]; children: React.ReactNode }) {
  const p = usePathname();
  const on = (h: string) => (h === links[0].href ? p === h : p.startsWith(h));
  return (
    <div className="wc">
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>{title}</h1>
      <div className="pan">
        <aside className="side">
          {links.map((l) => <Link key={l.href} href={l.href} className={on(l.href) ? "on" : ""}><i className={`ph ${l.ic}`} />{l.t}</Link>)}
        </aside>
        <div className="col" style={{ minWidth: 0, gap: 16 }}>{children}</div>
      </div>
    </div>
  );
}
