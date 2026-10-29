import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { fpt, type TeamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { Badge, stagger } from "@/components/ui";
import type { HeadToHead } from "@/lib/rivalries";

/*
 * Rivalità (Fase 6.3): testa a testa con ogni avversaria come lista compatta (stemma, barra divisa nei colori delle due
 * squadre, bilancio, punti fatti e subiti, ultimo risultato) e i due badge «bestia nera» e «vittima preferita».
 */

const team = (teams: TeamIndex, id: string) => teams.get(id) ?? { name: "?", owner: "", color: "var(--muted)" };
const record = (r: { wins: number; draws: number; losses: number }) => (r.draws ? `${r.wins}–${r.draws}–${r.losses}` : `${r.wins}–${r.losses}`);

function SplitBar({ r, mine, theirs }: { r: HeadToHead; mine: string; theirs: string }) {
  const n = r.wins + r.draws + r.losses;
  if (n === 0) return <span aria-hidden className="block h-1.5 w-full rounded-full border border-dashed border-line" />;
  return (
    <span aria-hidden className="flex h-1.5 w-full gap-px overflow-hidden rounded-full">
      {r.wins > 0 && <span className="meter-fill block h-full" style={{ width: `${(r.wins / n) * 100}%`, background: mine }} />}
      {r.draws > 0 && <span className="block h-full bg-foreground/25" style={{ width: `${(r.draws / n) * 100}%` }} />}
      {r.losses > 0 && <span className="block h-full" style={{ width: `${(r.losses / n) * 100}%`, background: theirs }} />}
    </span>
  );
}

/** Testa a testa di una squadra con tutte le altre. `you`: la pagina è della squadra dell'utente (testi in seconda persona). */
export function RivalryList({
  teamId,
  rows,
  badges,
  teams,
  you,
}: {
  teamId: string;
  rows: HeadToHead[];
  badges: { nemesis: HeadToHead | null; victim: HeadToHead | null };
  teams: TeamIndex;
  you: boolean;
}) {
  const me = team(teams, teamId);
  return (
    <div className="space-y-3">
      {(badges.nemesis || badges.victim) && (
        <div className="flex flex-wrap gap-1.5">
          {badges.nemesis && (
            <Badge tone="bad" icon="flame" title={`${record(badges.nemesis)} negli scontri diretti`}>
              {you ? "La tua bestia nera" : "Bestia nera"}: {team(teams, badges.nemesis.opponentId).name}
            </Badge>
          )}
          {badges.victim && (
            <Badge tone="good" icon="target" title={`${record(badges.victim)} negli scontri diretti`}>
              {you ? "La tua vittima preferita" : "Vittima preferita"}: {team(teams, badges.victim.opponentId).name}
            </Badge>
          )}
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.map((r, i) => {
          const o = team(teams, r.opponentId);
          const last = r.meetings.at(-1);
          const diff = r.pointsFor - r.pointsAgainst;
          const flagged = r === badges.nemesis ? "border-l-danger" : r === badges.victim ? "border-l-success" : "border-l-transparent";
          return (
            <li key={r.opponentId} className={`rise border-l-4 ${flagged}`} style={stagger(i)}>
              <Link href={`/squadre/${r.opponentId}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle/60">
                <TeamCrest name={o.name} color={o.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{o.name}</span>
                    <span className="font-display tnum shrink-0 text-xl leading-none font-extrabold">
                      {r.meetings.length ? record(r) : "–"}
                      <span className="sr-only">{r.meetings.length ? " vittorie e sconfitte negli scontri diretti" : " nessuno scontro diretto"}</span>
                    </span>
                  </span>
                  <span className="mt-1.5 block">
                    <SplitBar r={r} mine={me.color} theirs={o.color} />
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="truncate">
                      {last ? (
                        <>
                          G{last.matchday}: <span className={`font-bold ${last.outcome === "W" ? "text-success" : last.outcome === "L" ? "text-danger" : "text-foreground"}`}>{last.outcome === "W" ? "V" : last.outcome === "L" ? "P" : "N"}</span>{" "}
                          <span className="tnum">
                            {fpt(last.pointsFor)}–{fpt(last.pointsAgainst)}
                          </span>
                        </>
                      ) : r.next !== null ? (
                        `Prima sfida: giornata ${r.next}`
                      ) : (
                        "Mai affrontata"
                      )}
                    </span>
                    {r.meetings.length > 0 && (
                      <span className={`tnum shrink-0 font-semibold ${diff > 0 ? "text-success" : diff < 0 ? "text-danger" : ""}`} title="Differenza punti negli scontri diretti">
                        {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                        {fpt(Math.abs(diff))}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Riga «Precedenti» sotto uno scontro in classifica. */
export function PrecedentsLine({ p, homeId, awayId, teams }: { p: { played: number; homeWins: number; awayWins: number; draws: number }; homeId: string; awayId: string; teams: TeamIndex }) {
  const text =
    p.played === 0
      ? "Primo incrocio"
      : p.homeWins === p.awayWins
        ? `Precedenti: ${p.homeWins}–${p.awayWins}${p.draws ? ` (${p.draws} pari)` : ""}, in equilibrio`
        : `Precedenti: ${Math.max(p.homeWins, p.awayWins)}–${Math.min(p.homeWins, p.awayWins)}${p.draws ? ` (${p.draws} pari)` : ""} per ${team(teams, p.homeWins > p.awayWins ? homeId : awayId).name}`;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
      <Icon name="swap" size={13} className="shrink-0" />
      <span className="truncate">{text}</span>
    </p>
  );
}
