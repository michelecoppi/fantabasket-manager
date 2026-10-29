"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { PendingLabel } from "@/components/nav";
import { adminTools } from "./tools";

const tabs = [{ href: "/admin", label: "Panoramica", icon: "grid" as const }, ...adminTools];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Strumenti admin" className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pt-4 pb-1 sm:mx-0 sm:px-0 sm:pt-0">
      {tabs.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`font-display inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[1.0625rem] font-extrabold whitespace-nowrap transition-[background-color,border-color,color] ${
              active ? "border-brand-blue bg-brand-blue text-white dark:border-gold dark:bg-gold dark:text-nav" : "border-line bg-surface text-muted hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            <Icon name={t.icon} size={16} strokeWidth={2} className={active ? "text-gold dark:text-nav" : undefined} />
            <PendingLabel>{t.label}</PendingLabel>
          </Link>
        );
      })}
    </nav>
  );
}
