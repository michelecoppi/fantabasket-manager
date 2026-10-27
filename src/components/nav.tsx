"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Lega", icon: "ball" },
  { href: "/giocatori", label: "Giocatori", icon: "jersey" },
  { href: "/draft", label: "Draft", icon: "ticket" },
  { href: "/scadenze", label: "Scadenze", icon: "hourglass" },
  { href: "/scambio", label: "Scambio", icon: "swap" },
];
const adminLink = { href: "/admin", label: "Admin", icon: "badge" as const };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" || pathname.startsWith("/squadre") : pathname.startsWith(href);
}

/** Dentro un `<Link>`: pulsa mentre la navigazione è in corso (utile se la pagina non è ancora in prefetch). */
export function PendingLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "animate-pulse" : undefined}>{children}</span>;
}

/** Icona che rimbalza mentre la pagina di destinazione arriva. */
function PendingIcon({ name, size }: { name: IconName; size: number }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? "ball-bounce inline-flex" : "inline-flex"}>
      <Icon name={pending ? "ball" : name} size={size} />
    </span>
  );
}

/** Navigazione principale nell'header (da lg in su; sotto c'è la TabBar): icona + etichetta, sottolineatura oro sulla voce attiva. */
export function MainNav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const items = admin ? [...links, adminLink] : links;
  return (
    <nav aria-label="Navigazione principale" className="no-scrollbar hidden h-full items-stretch overflow-x-auto lg:flex">
      {items.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`group font-display relative flex items-center gap-2 px-3 text-[1.0625rem] font-extrabold tracking-wide whitespace-nowrap transition-colors 2xl:px-4 ${
              active ? "text-white" : "text-white/55 hover:text-white"
            }`}
          >
            <span className={active ? "text-gold" : "transition-colors group-hover:text-gold"}>
              <PendingIcon name={l.icon} size={18} />
            </span>
            {l.label}
            <span
              aria-hidden
              className={`absolute inset-x-3 bottom-0 h-[3px] origin-center rounded-t-full bg-gold transition-transform duration-300 2xl:inset-x-4 ${active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"}`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra in basso su telefono e tablet (sotto lg): le voci a portata di pollice, come un'app. */
export function TabBar({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const items = admin ? [...links, adminLink] : links;
  return (
    <nav
      aria-label="Navigazione principale"
      style={{ viewTransitionName: "tab-bar" }}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-nav/95 text-white backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex max-w-lg">
        {items.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-1 text-[0.625rem] font-bold tracking-wide uppercase transition-colors ${
                active ? "text-gold" : "text-white/55 active:text-white"
              }`}
            >
              <span aria-hidden className={`absolute top-0 h-[3px] w-8 rounded-b-full bg-gold transition-transform duration-300 ${active ? "scale-x-100" : "scale-x-0"}`} />
              <span className={`transition-transform duration-300 ${active ? "-translate-y-0.5 scale-110" : ""}`}>
                <PendingIcon name={l.icon} size={22} />
              </span>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
