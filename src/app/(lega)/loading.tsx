import { ViewTransition } from "react";

/** Scheletro mostrato subito alla navigazione, mentre la pagina arriva dal server. */
export default function Loading() {
  return (
    <ViewTransition exit="page-out" default="none">
      <div role="status" aria-label="Caricamento" className="animate-pulse space-y-4">
        <div className="h-10 w-56 rounded bg-foreground/10" />
        <div className="h-4 w-80 max-w-full rounded bg-foreground/10" />
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-32 rounded-lg border border-line bg-surface" />
          ))}
        </div>
      </div>
    </ViewTransition>
  );
}
