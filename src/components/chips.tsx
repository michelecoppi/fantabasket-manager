"use client";

import Link, { useLinkStatus } from "next/link";
import { useRef, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { edgeMask, useScrollEdges } from "@/components/use-scroll-edges";

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
  const ref = useRef<HTMLDivElement>(null);
  const mask = edgeMask(useScrollEdges(ref));
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="eyebrow hidden shrink-0 text-muted sm:inline">{label}</span>
      <div ref={ref} role="group" aria-label={label} style={{ maskImage: mask }} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
        {options.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            scroll={false}
            aria-current={o.active ? "true" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color] ${
              o.active ? "border-brand-blue bg-brand-blue text-white dark:border-gold dark:bg-gold dark:text-nav" : "border-line bg-surface text-foreground/80 hover:border-foreground/40"
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

function ViewInner({ icon, label, hint, active, stack, dense }: { icon: IconName; label: string; hint?: string; active: boolean; stack: boolean; dense: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className={`grid shrink-0 place-items-center rounded-lg ${stack ? "h-8 w-8 md:h-9 md:w-9" : "h-9 w-9"} ${active ? "bg-gold text-nav dark:bg-nav dark:text-gold" : "bg-surface-subtle"}`}>
        <Icon name={pending ? "ball" : icon} size={19} className={pending ? "ball-bounce" : undefined} />
      </span>
      {/* max-w-full: in colonna (items-center) l'etichetta non si allargherebbe oltre la linguetta e truncate non scatterebbe */}
      <span className={`min-w-0 ${stack ? "max-w-full text-center md:text-left" : "text-left"}`}>
        <span className={`font-display block truncate leading-none font-extrabold ${stack ? `${dense ? "text-[13px] tracking-tight md:tracking-normal" : "text-base"} md:text-xl` : "text-xl"}`}>{label}</span>
        {hint && <span className={`mt-0.5 hidden truncate text-xs ${stack ? "lg:block" : "sm:block"} ${active ? "text-white/65 dark:text-nav/70" : "text-muted"}`}>{hint}</span>}
      </span>
    </>
  );
}

/**
 * Due o più viste della stessa pagina come linguette grandi (stato nella query string, come i filtri). Con tre o più viste,
 * su telefono l'icona sta sopra l'etichetta, così le linguette entrano a 375 px senza tagliare il testo; da cinque viste in su
 * l'etichetta su telefono è più piccola (le cinque di `/classifica`).
 */
export function ViewSwitch({ label, options }: { label: string; options: { href: string; label: string; hint?: string; icon: IconName; active: boolean }[] }) {
  const stack = options.length > 2;
  const dense = options.length > 4;
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line bg-surface p-1">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          aria-current={o.active ? "page" : undefined}
          className={`flex min-h-14 min-w-0 rounded-xl py-2 transition-[background-color,color] ${
            stack ? `flex-col items-center justify-center gap-1 ${dense ? "px-0" : "px-1"} md:flex-row md:justify-start md:gap-3 md:px-4` : "items-center gap-3 px-2.5 sm:px-4"
          } ${o.active ? "bg-brand-blue text-white shadow-md dark:bg-gold dark:text-nav" : "text-muted hover:bg-surface-subtle hover:text-foreground"}`}
        >
          <ViewInner icon={o.icon} label={o.label} hint={o.hint} active={o.active} stack={stack} dense={dense} />
        </Link>
      ))}
    </nav>
  );
}
