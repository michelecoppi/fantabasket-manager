"use client";

import { useEffect } from "react";
import { Button } from "@/components/controls";
import { Icon } from "@/components/icons";

/** Errore di lettura (tipicamente Supabase non raggiungibile o progetto free in pausa): messaggio chiaro e nuovo tentativo. */
export default function LegaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="arena mx-auto mt-6 max-w-lg rounded-2xl px-6 py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold text-nav">
        <Icon name="alert" size={28} />
      </span>
      <p className="eyebrow mt-4 text-white/60">Timeout tecnico</p>
      <h1 className="font-display mt-1 text-5xl leading-none font-black">Dati non disponibili</h1>
      <p className="mt-3 text-sm leading-6 text-white/70">
        Non riesco a leggere i dati della lega. Può essere un problema di rete oppure il database è in pausa (succede dopo giorni senza
        accessi): in quel caso un admin deve riattivarlo da Supabase e ci vuole qualche minuto.
      </p>
      <Button variant="gold" icon="refresh" className="mt-6" onClick={() => retry()}>
        Riprova
      </Button>
    </div>
  );
}
