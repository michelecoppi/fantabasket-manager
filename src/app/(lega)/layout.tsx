import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { LeagueTicker, LeagueTickerFallback } from "@/components/league-ticker";
import { MainNav, TabBar } from "@/components/nav";
import { RefreshButton } from "@/components/refresh-button";
import { loadProfile } from "@/lib/league-server";

async function UserBadge() {
  const profile = await loadProfile();
  if (!profile) return null;
  return (
    <span className="hidden min-w-0 items-center gap-2 rounded-full border border-white/12 bg-white/5 py-1 pr-3 pl-1 text-xs text-white/75 lg:flex">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white">
        <Icon name="user" size={15} />
      </span>
      <span className="max-w-32 truncate font-semibold">{profile.display_name}</span>
      {profile.role === "admin" && <span className="rounded-full bg-gold px-1.5 py-px text-[0.625rem] font-black tracking-wider text-nav uppercase">admin</span>}
    </span>
  );
}

/** Le voci di navigazione dipendono dal ruolo (Admin solo per gli admin): finché il profilo non arriva si mostrano quelle comuni. */
async function Navs({ bar }: { bar: "top" | "bottom" }) {
  const profile = await loadProfile();
  const admin = profile?.role === "admin";
  return bar === "top" ? <MainNav admin={admin} /> : <TabBar admin={admin} />;
}

// Area per-utente: legge la sessione a ogni richiesta, quindi non può essere "instant" (validazione solo in dev).
export const instant = false;

export default function LegaLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#contenuto" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-gold focus:px-4 focus:py-3 focus:font-bold focus:text-nav">
        Vai al contenuto
      </a>
      <header style={{ viewTransitionName: "site-header" }} className="sticky top-0 z-30 bg-nav text-white shadow-[0_10px_30px_-20px_rgb(0_0_0/0.8)]">
        <div className="mx-auto flex h-16 max-w-[1440px] items-stretch gap-3 px-4 sm:px-6 lg:gap-6 lg:px-10">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Fantabasket Manager — home">
            <Image src="/logo.png" alt="" width={270} height={360} priority className="h-11 w-auto drop-shadow-[0_0_12px_rgb(244_180_42/0.25)]" />
            <span className="flex flex-col">
              <span className="font-display text-[1.65rem] leading-none font-black tracking-wide">Fantabasket</span>
              <span className="mt-0.5 text-[0.5625rem] font-bold tracking-[0.3em] text-gold/80 uppercase">League office</span>
            </span>
          </Link>
          <Suspense fallback={<MainNav />}>
            <Navs bar="top" />
          </Suspense>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Suspense>
              <UserBadge />
            </Suspense>
            <RefreshButton />
            <form action="/auth/signout" method="post">
              <button aria-label="Esci" title="Esci" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/8 hover:text-white">
                <Icon name="logout" size={19} />
              </button>
            </form>
          </div>
        </div>
        {/* Filo broadcast: i tre colori del logo. */}
        <div aria-hidden className="h-[3px] bg-linear-to-r from-brand-red via-[#1d47b5] to-gold" />
      </header>
      <Suspense fallback={<LeagueTickerFallback />}>
        <LeagueTicker />
      </Suspense>
      <main id="contenuto" tabIndex={-1} className="outline-none mx-auto w-full max-w-[1440px] flex-1 px-4 pt-0 pb-28 sm:px-6 sm:pt-8 md:pb-14 lg:px-10 lg:pt-10">{children}</main>
      <Suspense fallback={<TabBar />}>
        <Navs bar="bottom" />
      </Suspense>
    </>
  );
}
