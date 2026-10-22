import Link from "next/link";

export default function LegaNotFound() {
  return (
    <div className="mx-auto max-w-md rounded border border-line bg-surface p-6 text-center">
      <h1 className="font-display text-3xl font-extrabold">Pagina non trovata</h1>
      <p className="mt-2 text-sm text-muted">Questa pagina non esiste oppure non hai i permessi per vederla.</p>
      <Link href="/" className="font-display mt-4 inline-block rounded bg-brand-red px-4 py-2 text-lg font-bold text-white">
        Torna alla home
      </Link>
    </div>
  );
}
