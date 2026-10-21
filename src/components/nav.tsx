"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Lega" },
  { href: "/giocatori", label: "Giocatori" },
  { href: "/draft", label: "Draft" },
  { href: "/scadenze", label: "Scadenze" },
  { href: "/scambio", label: "Scambio" },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" || pathname.startsWith("/squadre") : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`font-display border-b-4 px-3 py-2 text-lg font-bold whitespace-nowrap transition ${
              active ? "border-brand-red text-white" : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
