import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { MainNav } from "@/components/nav";
import { RefreshButton } from "@/components/refresh-button";
import { loadProfile } from "@/lib/league-server";

async function UserBadge() {
  const profile = await loadProfile();
  if (!profile) return null;
  return (
    <span className="flex min-w-0 items-center gap-2 text-neutral-400">
      <span className="max-w-28 truncate">{profile.display_name}</span>
      {profile.role === "admin" && <span className="rounded bg-brand-red px-1.5 py-0.5 text-xs font-bold text-white uppercase">admin</span>}
    </span>
  );
}

// Area per-utente: legge la sessione a ogni richiesta, quindi non può essere "instant" (validazione solo in dev).
export const instant = false;

export default function LegaLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-nav text-white shadow-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 pt-2">
          <Link href="/" className="font-display flex items-center gap-2 pb-2 text-2xl font-extrabold">
            <Image src="/logo.png" alt="" width={270} height={360} priority className="h-10 w-auto" />
            Fantabasket
          </Link>
          <div className="ml-auto flex items-center gap-3 pb-2 text-sm">
            <Suspense>
              <UserBadge />
            </Suspense>
            <RefreshButton />
            <form action="/auth/signout" method="post">
              <button className="text-neutral-400 hover:text-white">Esci</button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4">
          <MainNav />
        </div>
        <div className="h-1 bg-gradient-to-r from-brand-blue via-brand-blue to-brand-red" />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Suspense fallback={<p className="text-sm text-muted">Caricamento…</p>}>{children}</Suspense>
      </main>
    </>
  );
}
