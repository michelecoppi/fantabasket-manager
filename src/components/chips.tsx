"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

function ChipInner({ children, count, active }: { children: ReactNode; count?: number; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className={pending ? "animate-pulse" : undefined}>{children}</span>
      {count !== undefined && (
        <span className={`tnum rounded-full px-1.5 text-[0.6875rem] font-bold ${active ? "bg-white/20 dark:bg-nav/20" : "bg-foreground/8 text-muted"}`}>{count}</span>
      )}
    </>
  );
}

/**
 * Gruppo di filtri come chip-link: lo stato vive nella query string (si può condividere il link) e basta un tocco,
 * senza "Applica". `scroll={false}` tiene la posizione mentre si cambia filtro.
 */
export function ChipLinks({ label, options }: { label: string; options: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="eyebrow hidden shrink-0 text-muted sm:inline">{label}</span>
      <div role="group" aria-label={label} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
        {options.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            scroll={false}
            aria-current={o.active ? "true" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color] ${
              o.active ? "border-nav bg-nav text-white dark:border-gold dark:bg-gold dark:text-nav" : "border-line bg-surface text-foreground/80 hover:border-foreground/40"
            }`}
          >
            <ChipInner count={o.count} active={o.active}>
              {o.label}
            </ChipInner>
          </Link>
        ))}
      </div>
    </div>
  );
}
