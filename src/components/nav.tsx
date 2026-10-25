"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { href: "/", label: "Lega" },
  { href: "/giocatori", label: "Giocatori" },
  { href: "/draft", label: "Draft" },
  { href: "/scadenze", label: "Scadenze" },
  { href: "/scambio", label: "Scambio" },
];

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" || pathname.startsWith("/squadre") : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`font-display -mb-px flex min-h-12 items-center border-b-2 px-4 text-lg font-bold whitespace-nowrap transition-colors sm:px-5 ${
        active ? "border-brand-red text-white" : "border-transparent text-neutral-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

/** `extra`: voci aggiuntive (es. Admin, solo per chi ne ha il ruolo). */
export function MainNav({ extra }: { extra?: ReactNode }) {
  return (
    <nav aria-label="Navigazione principale" className="main-nav -mb-px flex overflow-x-auto">
      {links.map((l) => (
        <NavLink key={l.href} {...l} />
      ))}
      {extra}
    </nav>
  );
}
