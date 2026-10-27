import type { ReactNode } from "react";
import { SheetTrigger } from "@/components/dunkest";
import { PosChip, stagger } from "@/components/ui";
import { fmt } from "@/lib/format";

/**
 * Riga giocatore condivisa (rose, scadenze, listone): gettone ruolo, nome e contesto, badge, contratto, valore in crediti.
 * Su telefono badge e contratto scendono sotto il nome invece di comprimere le cifre.
 * Dati Dunkest (issue #68): `status` (chip infortunio) resta accanto al nome anche su telefono, `score` (cella PDK) sta prima dei
 * crediti, `sheet` rende tutta la riga un pulsante che apre la scheda del giocatore.
 */
export function PlayerRow({
  pos,
  name,
  meta,
  badges,
  contract,
  value,
  status,
  score,
  sheet,
  i = 0,
}: {
  pos: string | null;
  name: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  contract?: ReactNode;
  value: number | null;
  status?: ReactNode;
  score?: ReactNode;
  sheet?: { id: string; name: string };
  i?: number;
}) {
  return (
    <li className="rise relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle/60 sm:px-4" style={stagger(i)}>
      {sheet && <SheetTrigger id={sheet.id} name={sheet.name} />}
      <PosChip pos={pos} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold">{name}</span>
          {status}
          {badges && <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">{badges}</span>}
        </div>
        {(meta || badges || contract) && (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {meta}
            {badges && <span className="inline-flex items-center gap-1 sm:hidden">{badges}</span>}
            {contract && <span className="sm:hidden">{contract}</span>}
          </div>
        )}
      </div>
      {contract && <span className="hidden shrink-0 sm:inline-flex">{contract}</span>}
      {score}
      <span className="font-display tnum w-12 shrink-0 text-right text-2xl leading-none font-black">{value === null ? "–" : fmt(value)}</span>
    </li>
  );
}

export function PlayerList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</ul>;
}
