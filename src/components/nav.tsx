"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

type NavLink = { href: string; label: string; icon: IconName; hint?: string };

/** Id del foglio «Altro»: lo aprono la voce della tab bar e quella dell'header. */
export const MORE_ID = "menu-altro";

const LEGA: NavLink = { href: "/", label: "Lega", icon: "ball" };
const CLASSIFICA: NavLink = { href: "/classifica", label: "Classifica", icon: "trophy" };
const GIOCATORI: NavLink = { href: "/giocatori", label: "Giocatori", icon: "jersey" };
const SCAMBIO: NavLink = { href: "/scambio", label: "Scambio", icon: "swap" };
const DRAFT: NavLink = { href: "/draft", label: "Draft", icon: "ticket", hint: "pick scambiate e ordine del rookie draft" };
const SCADENZE: NavLink = { href: "/scadenze", label: "Scadenze", icon: "hourglass", hint: "contratti in scadenza e planner del cap" };
const ADMIN: NavLink = { href: "/admin", label: "Admin", icon: "badge", hint: "firme, rose, scambi, pick, quote" };

/** Voci del foglio «Altro», in ordine d'uso. Draft e Scadenze ci stanno solo su telefono (nell'header hanno la loro voce). */
const MORE: NavLink[] = [
  // Issue #104: per ora il playground, poi l'asta vera.
  { href: "/asta", label: "Asta", icon: "gavel", hint: "playground della sala d'asta" },
  { href: "/storico-scambi", label: "Storico scambi", icon: "swap", hint: "tutti gli scambi registrati" },
  { href: "/storia", label: "Albo d'oro", icon: "medal", hint: "anelli e stagioni passate" },
  { href: "/giocatori/leader", label: "Leader NBA", icon: "star", hint: "i migliori della notte e della giornata" },
  { href: "/account", label: "Account", icon: "key", hint: "password e installazione dell'app" },
];

const starts = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Voce attiva. La home vale anche per le squadre degli altri (ci si arriva dal board), «Squadra» per la propria;
 * la classifica anche per l'albo d'oro (è una sua linguetta), lo scambio anche per lo storico.
 */
function isActive(pathname: string, href: string, myTeamHref: string | null) {
  if (href === "/") return pathname === "/" || (pathname.startsWith("/squadre") && !(myTeamHref && starts(pathname, myTeamHref)));
  if (href === CLASSIFICA.href) return starts(pathname, href) || starts(pathname, "/storia");
  if (href === SCAMBIO.href) return starts(pathname, href) || starts(pathname, "/storico-scambi");
  if (href === GIOCATORI.href) return starts(pathname, href) && !starts(pathname, "/giocatori/leader");
  return starts(pathname, href);
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

/** Numeri da mostrare sulle voci (per `href`): proposte di scambio che aspettano te o un admin (Fase 7.3). */
export type NavBadges = Partial<Record<string, number>>;

/** Pallino rosso col numero; il testo per i lettori di schermo lo dice per esteso. Lo usano anche tab e carte del pannello admin. */
export function Count({ n, className = "" }: { n: number | undefined; className?: string }) {
  if (!n) return null;
  return (
    <span className={`tnum grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-brand-red px-1 font-sans text-[0.6875rem] leading-none font-bold tracking-normal text-white ${className}`}>
      {n > 9 ? "9+" : n}
      <span className="sr-only"> da gestire</span>
    </span>
  );
}

const headerItem = (active: boolean) =>
  `group font-display relative flex items-center gap-2 px-2 text-[1.0625rem] font-extrabold tracking-wide whitespace-nowrap transition-colors xl:px-3 ${
    active ? "text-white" : "text-white/55 hover:text-white"
  }`;

function Underline({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-x-2 bottom-0 h-[3px] origin-center rounded-t-full bg-gold transition-transform duration-300 xl:inset-x-3 ${active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"}`}
    />
  );
}

/**
 * Navigazione principale nell'header (da lg in su; sotto c'è la TabBar): icona + etichetta, sottolineatura oro sulla voce attiva.
 * Fino a xl le voci sono più strette. Draft e Scadenze compaiono da 2xl (prima stanno in «Altro»): così anche con Admin, logo e
 * nome utente le voci non si tagliano da 1024 px in su. Le pagine usate di rado
 * stanno nel foglio «Altro».
 */
export function MainNav({ admin = false, badges = {} }: { admin?: boolean; badges?: NavBadges }) {
  const pathname = usePathname();
  const items = [LEGA, CLASSIFICA, GIOCATORI, SCAMBIO, DRAFT, SCADENZE, ...(admin ? [ADMIN] : [])];
  // Draft o Scadenze tra 1024 e 1536 px: la loro voce è nascosta, quindi si accende «Altro»
  const inMoreBelow2xl = isActive(pathname, DRAFT.href, null) || isActive(pathname, SCADENZE.href, null);
  const moreActive = !items.some((i) => isActive(pathname, i.href, null)) && MORE.some((l) => isActive(pathname, l.href, null));
  return (
    <nav aria-label="Navigazione principale" className="no-scrollbar hidden h-full items-stretch overflow-x-auto lg:flex">
      {items.map((l) => {
        const active = isActive(pathname, l.href, null);
        // Draft e Scadenze da 2xl: tra 1024 e 1536 px stanno nel foglio «Altro», così le voci non si tagliano
        const wide = l === DRAFT || l === SCADENZE;
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={`${headerItem(active)} ${wide ? "max-2xl:hidden" : ""}`}>
            <span className={active ? "text-brand-blue dark:text-gold" : "transition-colors group-hover:text-brand-blue dark:group-hover:text-gold"}>
              <PendingIcon name={l.icon} size={18} />
            </span>
            {l.label}
            <Count n={badges[l.href]} />
            <Underline active={active} />
          </Link>
        );
      })}
      <button type="button" popoverTarget={MORE_ID} className={`${headerItem(moreActive)} ${inMoreBelow2xl ? "max-2xl:text-white" : ""}`}>
        <span className={moreActive ? "text-brand-blue dark:text-gold" : `transition-colors group-hover:text-brand-blue dark:group-hover:text-gold ${inMoreBelow2xl ? "max-2xl:text-brand-blue max-2xl:dark:text-gold" : ""}`}>
          <Icon name="menu" size={18} />
        </span>
        Altro
        <Underline active={moreActive} />
        {inMoreBelow2xl && <span aria-hidden className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-gold 2xl:hidden" />}
      </button>
    </nav>
  );
}

/**
 * Barra in basso su telefono e tablet (sotto lg): le cinque pagine che si aprono di più, a portata di pollice, più «Altro».
 * «Squadra» porta alla propria squadra (se il profilo ne ha una). Le voci partono dalla larghezza della loro etichetta e si
 * dividono lo spazio che avanza (`flex-auto`, non `flex-1`).
 */
export function TabBar({ admin = false, badges = {}, myTeamId }: { admin?: boolean; badges?: NavBadges; myTeamId?: string | null }) {
  const pathname = usePathname();
  const myTeamHref = myTeamId ? `/squadre/${myTeamId}` : null;
  // `undefined` = profilo non ancora arrivato: la voce resta al suo posto (porta alla home), così la barra non salta.
  const team: NavLink[] = myTeamHref ? [{ href: myTeamHref, label: "Squadra", icon: "shield" }] : myTeamId === undefined ? [{ href: "/", label: "Squadra", icon: "shield" }] : [];
  const items: NavLink[] = [LEGA, CLASSIFICA, ...team, GIOCATORI, SCAMBIO];
  const moreActive = !items.some((l) => isActive(pathname, l.href, myTeamHref));
  const moreCount = admin ? badges[ADMIN.href] : undefined;
  const cell = (active: boolean) =>
    `relative flex min-h-[3.75rem] min-w-0 flex-auto flex-col items-center justify-center gap-1 text-[0.625rem] font-bold tracking-wide whitespace-nowrap uppercase transition-colors ${
      active ? "text-brand-blue dark:text-gold" : "text-white/55 active:text-white"
    }`;
  const bar = (active: boolean) => (
    <span aria-hidden className={`absolute top-0 h-[3px] w-8 rounded-b-full bg-gold transition-transform duration-300 ${active ? "scale-x-100" : "scale-x-0"}`} />
  );
  return (
    <nav
      aria-label="Navigazione principale"
      style={{ viewTransitionName: "tab-bar" }}
      className="chrome safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex max-w-lg">
        {items.map((l, i) => {
          const active = isActive(pathname, l.href, myTeamHref) && !(l.label === "Squadra" && !myTeamHref);
          return (
            <Link key={`${l.href}-${i}`} href={l.href} aria-current={active ? "page" : undefined} className={cell(active)}>
              {bar(active)}
              <span className={`relative transition-transform duration-300 ${active ? "-translate-y-0.5 scale-110" : ""}`}>
                <PendingIcon name={l.icon} size={22} />
                <Count n={badges[l.href]} className="absolute -top-1.5 -right-2.5" />
              </span>
              {l.label}
            </Link>
          );
        })}
        <button type="button" popoverTarget={MORE_ID} aria-current={moreActive ? "page" : undefined} className={cell(moreActive)}>
          {bar(moreActive)}
          <span className={`relative transition-transform duration-300 ${moreActive ? "-translate-y-0.5 scale-110" : ""}`}>
            <Icon name="menu" size={22} />
            <Count n={moreCount} className="absolute -top-1.5 -right-2.5" />
          </span>
          Altro
        </button>
      </div>
    </nav>
  );
}

/** Chiude il foglio quando si sceglie una voce: la navigazione è lato client e il popover resterebbe aperto. */
const closeSheet = (e: MouseEvent<HTMLElement>) => (e.currentTarget.closest("[popover]") as HTMLElement | null)?.hidePopover();

function MoreRow({ link, active, count }: { link: NavLink; active: boolean; count?: number }) {
  return (
    <li>
      <Link
        href={link.href}
        onClick={closeSheet}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors ${active ? "bg-brand-blue/10 dark:bg-gold/12" : "hover:bg-surface-subtle"}`}
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-brand-blue text-white dark:bg-gold dark:text-nav" : "bg-surface-subtle text-brand-blue dark:text-gold"}`}>
          <Icon name={link.icon} size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display flex items-center gap-2 text-xl leading-none font-extrabold">
            {link.label}
            <Count n={count} />
          </span>
          {link.hint && <span className="mt-0.5 block truncate text-xs text-muted">{link.hint}</span>}
        </span>
        <Icon name="chevron" size={18} className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}

/**
 * Foglio «Altro» (popover nativo, `.sheet`: dal basso su telefono, finestra centrata da 640 px): le pagine usate di rado,
 * l'account e l'uscita. «Esci» sta in testa al foglio, accanto alla chiusura: in fondo cadrebbe proprio sopra la voce «Altro»
 * della tab bar, e due tocchi su «Altro» farebbero uscire.
 */
export function MoreSheet({ admin = false, badges = {}, myTeamId = null }: { admin?: boolean; badges?: NavBadges; myTeamId?: string | null }) {
  const pathname = usePathname();
  const myTeamHref = myTeamId ? `/squadre/${myTeamId}` : null;
  // Draft e Scadenze stanno in cima al foglio finché l'header non ha la loro voce (2xl); Admin finché c'è la tab bar (sotto lg).
  return (
    <div id={MORE_ID} popover="auto" role="dialog" aria-labelledby={`${MORE_ID}-titolo`} className="sheet">
      <div className="sticky top-0 z-[1] flex items-center gap-3 border-b border-line bg-surface px-5 pt-3 pb-3 sm:pt-4">
        <span aria-hidden className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-foreground/15 sm:hidden" />
        <h2 id={`${MORE_ID}-titolo`} className="font-display mt-2 flex-1 text-3xl leading-none font-black sm:mt-0">
          Altro
        </h2>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold text-danger transition-colors hover:bg-danger/8"
          >
            <Icon name="logout" size={17} />
            Esci
          </button>
        </form>
        <button
          type="button"
          popoverTarget={MORE_ID}
          popoverTargetAction="hide"
          aria-label="Chiudi"
          className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
        >
          <Icon name="x" size={20} strokeWidth={2.2} />
        </button>
      </div>
      <nav aria-label="Altre pagine" className="px-2 py-2">
        <ul className="2xl:hidden">
          {[DRAFT, SCADENZE].map((l) => (
            <MoreRow key={l.href} link={l} active={isActive(pathname, l.href, myTeamHref)} />
          ))}
        </ul>
        {admin && (
          <ul className="lg:hidden">
            <MoreRow link={ADMIN} active={isActive(pathname, ADMIN.href, myTeamHref)} count={badges[ADMIN.href]} />
          </ul>
        )}
        <ul>
          {MORE.map((l) => (
            <MoreRow key={l.href} link={l} active={isActive(pathname, l.href, myTeamHref)} />
          ))}
        </ul>
      </nav>
    </div>
  );
}
