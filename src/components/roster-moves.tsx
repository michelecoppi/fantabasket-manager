import { Icon } from "@/components/icons";
import { PosChip, stagger } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { groupMoves, type RosterMove } from "@/lib/roster-moves";

/*
 * Cambi di rosa su Dunkest (Fase 6): un gruppo per aggiornamento del job (o per ultima giornata in formazione, per i cambi
 * ricostruiti), con le uscite in rosso e gli ingressi in verde. Testo e freccia, mai solo colore.
 */

/** Aggiornamenti mostrati prima di «Tutti i cambi»: in una stagione possono essere decine. */
const GROUPS_SHOWN = 5;

function MoveRow({ m, i }: { m: RosterMove; i: number }) {
  const out = m.move === "out";
  return (
    <li className="rise flex min-h-11 items-center gap-2.5 px-3 py-2" style={stagger(i)}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${out ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
        <Icon name="arrow-right" size={13} strokeWidth={2.6} className={out ? "" : "rotate-180"} />
      </span>
      <PosChip pos={m.pos} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
      <span className={`shrink-0 text-[0.6875rem] font-bold tracking-wide uppercase ${out ? "text-danger" : "text-success"}`}>{out ? "Uscito" : "Entrato"}</span>
    </li>
  );
}

export function RosterMovesList({ moves }: { moves: RosterMove[] }) {
  if (moves.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Nessun cambio di rosa su Dunkest finora.</p>;
  }
  const groups = groupMoves(moves);
  return (
    <div className="group/moves space-y-3">
      {groups.map((g, gi) => (
        <div key={g.key} className={`overflow-hidden rounded-2xl border border-line bg-surface ${gi >= GROUPS_SHOWN ? "hidden group-has-[details[open]]/moves:block" : ""}`}>
          <h3 className="eyebrow flex items-baseline justify-between gap-2 border-b border-line bg-surface-subtle/60 px-3 py-1.5 text-muted">
            {g.seenAt ? (
              <>
                <span>Visti il {fmtDateTime(g.seenAt)}</span>
                {g.seenMatchday !== null && <span className="tracking-normal normal-case">ultima giornata con punti: {g.seenMatchday}</span>}
              </>
            ) : (
              <>
                <span>Dopo la giornata {g.lastFielded}</span>
                <span className="tracking-normal normal-case">ricostruito dalle formazioni</span>
              </>
            )}
          </h3>
          <ul className="divide-y divide-line">
            {g.moves.map((m, i) => (
              <MoveRow key={`${m.move}-${m.fantasyId}-${m.seenAt ?? ""}`} m={m} i={i} />
            ))}
          </ul>
        </div>
      ))}
      {groups.length > GROUPS_SHOWN && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-2xl border border-line text-sm font-bold text-brand-blue [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Tutti i cambi della stagione ({groups.length - GROUPS_SHOWN} aggiornamenti in più)</span>
            <span className="hidden group-open:inline">Solo gli ultimi {GROUPS_SHOWN}</span>
            <Icon name="chevron" size={15} strokeWidth={2.4} className="rotate-90 transition-transform group-open:-rotate-90" />
          </summary>
        </details>
      )}
      <p className="text-xs text-muted">
        I cambi si registrano a ogni aggiornamento del mattino. Per quelli di prima del 29/10 si sanno solo le uscite: chi era schierato e non è più nella rosa
        Dunkest. Nelle formazioni di quelle giornate i giocatori usciti hanno l&apos;etichetta «Sostituito dopo».
      </p>
    </div>
  );
}
