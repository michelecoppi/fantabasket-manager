"use client";

import { useEffect } from "react";

/** Errore di lettura (tipicamente Supabase non raggiungibile o progetto free in pausa): messaggio chiaro e nuovo tentativo. */
export default function LegaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md rounded border border-line bg-surface p-6 text-center">
      <h1 className="font-display text-3xl font-extrabold">Dati non disponibili</h1>
      <p className="mt-2 text-sm text-muted">
        Non riesco a leggere i dati della lega. Può essere un problema di rete oppure il database è in pausa (succede dopo giorni senza
        accessi): in quel caso un admin deve riattivarlo da Supabase e ci vuole qualche minuto.
      </p>
      <button type="button" onClick={() => retry()} className="font-display mt-4 rounded bg-brand-red px-4 py-2 text-lg font-bold text-white">
        Riprova
      </button>
    </div>
  );
}
