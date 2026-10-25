import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { MainNav, NavLink } from "@/components/nav";
import { RefreshButton } from "@/components/refresh-button";
import { loadProfile } from "@/lib/league-server";

async function UserBadge() {
  const profile = await loadProfile();
  if (!profile) return null;
  return (
    <span className="hidden min-w-0 items-center gap-2 text-xs text-neutral-400 md:flex">
      <span className="max-w-32 truncate">{profile.display_name}</span>
      {profile.role === "admin" && <span className="border border-brand-red/60 px-1.5 py-0.5 font-bold text-accent uppercase">admin</span>}
    </span>
  );
}

async function AdminTab() {
  const profile = await loadProfile();
  return profile?.role === "admin" ? <NavLink href="/admin" label="Admin" /> : null;
}

// Area per-utente: legge la sessione a ogni richiesta, quindi non può essere "instant" (validazione solo in dev).
export const instant = false;

export default function LegaLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b-2 border-brand-red bg-nav text-white">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex min-h-12 items-center gap-2.5" aria-label="Fantabasket Manager — home">
            <Image src="/logo.png" alt="" width={270} height={360} priority className="h-11 w-auto" />
            <span className="flex flex-col">
              <span className="font-display text-2xl leading-none font-extrabold">Fantabasket</span>
              <span className="mt-1 text-[0.5625rem] font-bold tracking-[0.28em] text-neutral-400 uppercase">League operations</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Suspense>
              <UserBadge />
            </Suspense>
            <RefreshButton />
            <form action="/auth/signout" method="post">
              <button className="min-h-11 px-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-white sm:px-3">Esci</button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-[1440px] border-t border-white/10 px-2 sm:px-4 lg:px-8">
          <MainNav
            extra={
              <Suspense>
                <AdminTab />
              </Suspense>
            }
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        <Suspense
          fallback={
            <div className="animate-pulse" role="status" aria-label="Caricamento dei dati della lega">
              <div className="h-56 bg-surface-subtle" />
              <div className="mt-8 h-5 w-48 bg-surface-subtle" />
              <div className="mt-4 space-y-px">
                {[0, 1, 2, 3].map((row) => <div key={row} className="h-20 bg-surface-subtle" />)}
              </div>
            </div>
          }
        >
          {children}
        </Suspense>
      </main>
    </>
  );
}
