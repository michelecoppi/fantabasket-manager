"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/icons";

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
      className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-80"
    >
      <Icon name={pending ? "ball" : "refresh"} size={19} className={pending ? "ball-spin text-gold" : undefined} />
    </button>
  );
}
