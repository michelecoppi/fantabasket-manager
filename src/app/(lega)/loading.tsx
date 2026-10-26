import { ViewTransition } from "react";
import { BallLoader } from "@/components/icons";

/** Scheletro mostrato subito alla navigazione, mentre la pagina arriva dal server: stessa struttura di testata + righe. */
export default function Loading() {
  return (
    <ViewTransition exit="page-out" default="none">
      <div role="status" aria-label="Caricamento">
        <div className="arena -mx-4 mb-8 flex min-h-48 items-end justify-between px-5 py-7 sm:mx-0 sm:rounded-2xl sm:px-8">
          <div className="space-y-3">
            <div className="h-3 w-32 rounded bg-white/15" />
            <div className="h-12 w-64 max-w-full rounded bg-white/15" />
            <div className="h-3 w-80 max-w-full rounded bg-white/10" />
          </div>
          <BallLoader size={28} className="text-white" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <span className="sr-only">Caricamento…</span>
      </div>
    </ViewTransition>
  );
}
