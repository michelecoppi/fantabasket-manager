"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { href: "/", label: "Lega" },
  { href: "/giocatori", label: "Giocatori" },
  { href: "/draft", label: "Draft" },
  { href: "/scadenze", label: "Scadenze" },
  { href: "/scambio", label: "Scambio" },
];

/** Dentro un `<Link>`: pulsa mentre la navigazione è in corso (utile se la pagina non è ancora in prefetch). */
export function PendingLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "animate-pulse" : undefined}>{children}</span>;
}

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" || pathname.startsWith("/squadre") : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`font-display border-b-4 px-3 py-2 text-lg font-bold whitespace-nowrap transition ${
        active ? "border-brand-red text-white" : "border-transparent text-neutral-400 hover:text-white"
      }`}
    >
      <PendingLabel>{label}</PendingLabel>
    </Link>
  );
}

/** `extra`: voci aggiuntive (es. Admin, solo per chi ne ha il ruolo). */
export function MainNav({ extra }: { extra?: ReactNode }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {links.map((l) => (
        <NavLink key={l.href} {...l} />
      ))}
      {extra}
    </nav>
  );
}
