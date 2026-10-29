import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { InjuryChip, PdkCell, SheetTrigger, sheetId } from "@/components/dunkest";
import type { TeamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { PosChip, stagger } from "@/components/ui";
import type { DunkestView } from "@/lib/dunkest";
import { fmt } from "@/lib/format";
import type { ValueRow } from "@/lib/value";

/*
 * Affari e flop (Fase 6.2): giocatori a contratto messi a confronto per posizione di stipendio e di punteggio Dunkest.
 * Gli affari hanno l'accento blu, i flop rosso; la pista a due tacche mostra dove sta il giocatore per stipendio (tacca vuota)
 * e per rendimento (tacca piena), col tratto in mezzo che misura la distanza.
 */

type Kind = "deal" | "flop";
const TONE: Record<Kind, { text: string; bg: string; border: string }> = {
  deal: { text: "text-brand-blue", bg: "bg-brand-blue", border: "border-brand-blue" },
  flop: { text: "text-danger", bg: "bg-danger", border: "border-danger" },
};

const team = (teams: TeamIndex, id: string) => teams.get(id) ?? { name: "?", owner: "", color: "var(--muted)" };

/** «pagato 41° · rende 6°» come testo (anche per i lettori di schermo). */
export const rankText = (r: ValueRow) => `pagato ${r.salaryRank}° · rende ${r.pdkRank}°`;

/** Pista 1…pool: tacca vuota = posizione per stipendio, tacca piena = posizione per PDK. */
export function RankTrack({ row, pool, kind }: { row: ValueRow; pool: number; kind: Kind }) {
  const at = (rank: number) => (pool <= 1 ? 0 : ((rank - 1) / (pool - 1)) * 100);
  const a = at(row.salaryRank);
  const b = at(row.pdkRank);
  const t = TONE[kind];
  return (
    <span aria-hidden className="relative block h-3 w-full">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" />
      <span className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-40 ${t.bg}`} style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }} />
      <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface ${t.border}`} style={{ left: `${a}%` }} />
      <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${t.bg}`} style={{ left: `${b}%` }} />
    </span>
  );
}

function Row({ r, i, pool, kind, teams, dunkest }: { r: ValueRow; i: number; pool: number; kind: Kind; teams: TeamIndex; dunkest: DunkestView }) {
  const t = team(teams, r.teamId);
  const injury = dunkest.injuries.get(r.playerId);
  return (
    <li className="rise relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle/60 sm:px-4" style={stagger(i)}>
      <SheetTrigger id={sheetId(r.playerId)} name={r.name} />
      <span className={`font-display tnum w-5 shrink-0 text-center text-xl leading-none font-black ${i < 3 ? TONE[kind].text : "text-muted"}`}>{i + 1}</span>
      {/* su telefono il ruolo lascia spazio a pista e posizioni */}
      <span className="hidden sm:block">
        <PosChip pos={r.pos} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold">{r.name}</span>
          {injury && <InjuryChip injury={injury} />}
        </div>
        <Link href={`/squadre/${r.teamId}`} className="relative z-[2] mt-0.5 inline-flex max-w-full items-center gap-1.5 text-xs text-muted hover:underline">
          <TeamCrest name={t.name} color={t.color} size="xs" />
          <span className="truncate">{t.name}</span>
          {r.slot === "reserve" && <span className="shrink-0">· riserva</span>}
        </Link>
        <span className="mt-1.5 block max-w-56">
          <RankTrack row={r} pool={pool} kind={kind} />
        </span>
        <span className="tnum mt-0.5 block truncate text-[0.6875rem] text-muted">{rankText(r)}</span>
      </div>
      <PdkCell stats={dunkest.stats.get(r.playerId)} role={r.pos ? dunkest.roles[r.pos] : dunkest.all} />
      <span className="font-display tnum w-12 shrink-0 text-right text-2xl leading-none font-black">
        {fmt(r.salary)}
        <span className="sr-only"> crediti</span>
      </span>
    </li>
  );
}

/** Una delle due liste (affari o flop), con intestazione colorata. */
export function ValueList({ kind, rows, pool, teams, dunkest }: { kind: Kind; rows: ValueRow[]; pool: number; teams: TeamIndex; dunkest: DunkestView }) {
  const deal = kind === "deal";
  return (
    <section aria-labelledby={`lista-${kind}`} className="min-w-0">
      <div className={`flex items-center gap-2.5 rounded-t-2xl border border-b-0 border-line bg-surface px-3 py-2.5 sm:px-4`}>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white ${TONE[kind].bg}`}>
          <Icon name={deal ? "trending-up" : "trending-down"} size={18} strokeWidth={2.2} />
        </span>
        <h2 id={`lista-${kind}`} className="font-display min-w-0 flex-1 text-3xl leading-none font-extrabold">
          {deal ? "Affari" : "Flop"}
        </h2>
        <span className="text-right text-xs font-semibold text-muted">{deal ? "rendono più di quanto costano" : "costano più di quanto rendono"}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-b-2xl border border-line px-4 py-6 text-center text-sm text-muted">Nessun giocatore, per ora.</p>
      ) : (
        <ol className={`divide-y divide-line overflow-hidden rounded-b-2xl border border-t-2 border-line bg-surface ${deal ? "border-t-brand-blue" : "border-t-danger"}`}>
          {rows.map((r, i) => (
            <Row key={r.playerId} r={r} i={i} pool={pool} kind={kind} teams={teams} dunkest={dunkest} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** «Il tuo affare» e «Il tuo flop» per la pagina squadra. */
export function TeamValue({ deal, flop, pool, you }: { deal: ValueRow | null; flop: ValueRow | null; pool: number; you: boolean }) {
  const card = (kind: Kind, r: ValueRow | null) => {
    const label = kind === "deal" ? (you ? "Il tuo affare" : "L'affare") : you ? "Il tuo flop" : "Il flop";
    return (
      <div className={`rise relative min-w-0 overflow-hidden rounded-2xl border border-line bg-surface py-3 pr-3 pl-4 ${r ? "transition-colors hover:bg-surface-subtle/60" : ""}`} style={stagger(kind === "deal" ? 0 : 1)}>
        <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${TONE[kind].bg}`} />
        {r && <SheetTrigger id={sheetId(r.playerId)} name={r.name} />}
        <span className={`eyebrow flex items-center gap-1.5 ${TONE[kind].text}`}>
          <Icon name={kind === "deal" ? "trending-up" : "trending-down"} size={14} strokeWidth={2.4} />
          {label}
        </span>
        {r ? (
          <>
            <span className="mt-1.5 flex min-w-0 items-center gap-2">
              <PosChip pos={r.pos} />
              <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
              <span className="font-display tnum shrink-0 text-2xl leading-none font-black">{fmt(r.salary)}</span>
            </span>
            <span className="mt-2 block">
              <RankTrack row={r} pool={pool} kind={kind} />
            </span>
            <span className="tnum mt-0.5 block text-[0.6875rem] text-muted">{rankText(r)}</span>
          </>
        ) : (
          <span className="mt-1.5 block text-sm text-muted">{kind === "deal" ? "Nessuno rende più di quanto è pagato." : "Nessuno rende meno di quanto è pagato."}</span>
        )}
      </div>
    );
  };
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {card("deal", deal)}
      {card("flop", flop)}
    </div>
  );
}
