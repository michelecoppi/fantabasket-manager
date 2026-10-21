"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Ricarica i dati della pagina corrente dal server, ignorando la cache del router. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label="Aggiorna i dati"
      title="Aggiorna i dati"
      className="text-neutral-400 hover:text-white disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={pending ? "animate-spin" : undefined} aria-hidden>
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
