import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { PosChip, stagger } from "@/components/ui";
import type { GameLine, LeaderRow } from "@/lib/dunkest-games";
import { fmt, fmtDay } from "@/lib/format";
import type { TeamView } from "@/lib/league";

/*
 * Leader NBA su Dunkest (notte e giornata) e andamento partita per partita di un giocatore, nel design system Arena Night.
 * Le righe mostrano chi, nella lega, ha il giocatore: è la cosa che il sito di Dunkest non sa.
 */

/** Squadra della lega che ha il giocatore in rosa. */
export interface LeaderOwner {
  teamId: string;
  name: string;
  color: string;
}

/** Giocatore (id del listone) → squadra della lega che lo ha in rosa, titolari e riserve. */
export function leaderOwners(teams: TeamView[], colors: Map<string, string>): Map<number, LeaderOwner> {
  const out = new Map<number, LeaderOwner>();
  for (const t of teams) for (const p of [...t.starters, ...t.reserves]) out.set(p.playerId, { teamId: t.team.id, name: t.team.name, color: colors.get(t.team.id) ?? "#555" });
  return out;
}

export function LeaderList({ rows, owners, myTeamId, kind }: { rows: LeaderRow[]; owners: Map<number, LeaderOwner>; myTeamId?: string | null; kind: "night" | "week" }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r, i) => {
        const owner = r.playerId === null ? undefined : owners.get(r.playerId);
        const mine = !!owner && owner.teamId === myTeamId;
        return (
          <li key={r.dunkestId} className={`rise relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle/60 sm:px-4 ${mine ? "bg-gold/10" : ""}`} style={stagger(i)}>
            <span className="font-display tnum w-6 shrink-0 text-center text-xl leading-none font-black text-muted">{i + 1}</span>
            <PosChip pos={r.pos} />
            <span className="min-w-0 flex-1">
              {r.playerId === null ? (
                <span className="block truncate font-semibold">{r.name}</span>
              ) : (
                <Link href={`/giocatori/${r.playerId}`} className="block truncate font-semibold after:absolute after:inset-0 after:content-[''] hover:underline">
                  {r.name}
                </Link>
              )}
              <span className="tnum block truncate text-xs text-muted">
                {r.teamCode} · {r.pts} pt · {r.reb} rb · {r.ast} as · {kind === "night" ? `${fmt(r.min ?? 0)}′` : `${r.gp} ${r.gp === 1 ? "partita" : "partite"}`}
              </span>
            </span>
            {owner && (
              <Link
                href={`/squadre/${owner.teamId}`}
                title={`In rosa a ${owner.name}`}
                className="relative z-[2] inline-flex max-w-32 shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2 text-sm font-semibold hover:underline"
              >
                <TeamCrest name={owner.name} color={owner.color} size="xs" />
                <span className="hidden truncate sm:inline">{owner.name}</span>
              </Link>
            )}
            <span className="font-display tnum w-14 shrink-0 text-right text-2xl leading-none font-black text-brand-blue">{fmt(r.pdk)}</span>
          </li>
        );
      })}
    </ul>
  );
}

const W = 600;
const H = 140;

/**
 * Punteggio Dunkest di ogni partita come barre (la migliore in oro), con la media della stagione tratteggiata. Il dettaglio
 * delle partite resta nella tabella accanto: qui conta la forma.
 */
export function GameBars({ lines, avg }: { lines: GameLine[]; avg: number }) {
  const lo = Math.min(0, ...lines.map((g) => g.pdk));
  const hi = Math.max(10, ...lines.map((g) => g.pdk));
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const slot = W / lines.length;
  const bw = Math.max(2, Math.min(28, slot - 3));
  const best = Math.max(...lines.map((g) => g.pdk));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label={`Punteggio Dunkest in ${lines.length} partite, media ${fmt(avg)}`} preserveAspectRatio="none">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {lines.map((g, i) => (
          <rect
            key={g.date}
            x={i * slot + (slot - bw) / 2}
            y={y(Math.max(g.pdk, 0))}
            width={bw}
            height={Math.max(1, Math.abs(y(g.pdk) - y(0)))}
            rx={2}
            className={g.pdk === best ? "fill-gold" : "fill-brand-blue"}
          >
            <title>{`${fmtDay(g.date)}: ${fmt(g.pdk)}`}</title>
          </rect>
        ))}
        <line x1={0} x2={W} y1={y(avg)} y2={y(avg)} className="stroke-foreground/60" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="tnum mt-1 flex justify-between text-[0.6875rem] font-bold tracking-wide text-muted uppercase">
        <span>{fmtDay(lines[0].date)}</span>
        <span>tratteggio = media {fmt(avg)}</span>
        <span>{fmtDay(lines[lines.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}
