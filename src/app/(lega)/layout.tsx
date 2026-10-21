import Link from "next/link";
import { Suspense } from "react";
import { loadProfile } from "@/lib/league-server";

async function UserBadge() {
  const profile = await loadProfile();
  if (!profile) return null;
  return (
    <span className="hidden text-neutral-500 sm:inline">
      {profile.display_name}
      {profile.role === "admin" && " · admin"}
    </span>
  );
}

export default function LegaLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-background/90 backdrop-blur dark:border-neutral-800">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-bold">🏀 Fantabasket</Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/" className="hover:underline">Lega</Link>
            <Link href="/draft" className="hover:underline">Draft</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Suspense>
              <UserBadge />
            </Suspense>
            <form action="/auth/signout" method="post">
              <button className="text-neutral-500 hover:underline">Esci</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Suspense fallback={<p className="text-sm text-neutral-500">Caricamento…</p>}>{children}</Suspense>
      </main>
    </>
  );
}
