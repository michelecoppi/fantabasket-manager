"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PendingLabel } from "@/components/nav";

const tabs = [
  { href: "/admin", label: "Panoramica" },
  { href: "/admin/scambio", label: "Scambio" },
  { href: "/admin/firma", label: "Firma" },
  { href: "/admin/rose", label: "Rose" },
  { href: "/admin/pick", label: "Pick" },
  { href: "/admin/quote", label: "Quote" },
  { href: "/admin/registro", label: "Registro" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Strumenti admin" className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`font-display min-h-10 rounded-full border px-4 py-1.5 text-lg font-bold whitespace-nowrap transition ${
              active ? "border-brand-red bg-brand-red text-white" : "border-line bg-surface text-muted hover:border-brand-red hover:text-foreground"
            }`}
          >
            <PendingLabel>{t.label}</PendingLabel>
          </Link>
        );
      })}
    </nav>
  );
}
