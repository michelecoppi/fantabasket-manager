import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamCrest } from "@/components/crest";
import { DunkestSource, InjuryChip } from "@/components/dunkest";
import { GameBars } from "@/components/leaders";
import { Empty, PageTitle, PosChip, Scoreboard } from "@/components/ui";
import { summarizeGames } from "@/lib/dunkest-games";
import { fmt, fmtDay } from "@/lib/format";
import { loadDunkest, loadLeague, loadPlayerGames, loadPlayers } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

const th = "px-2 py-2 text-right font-bold";
const td = "tnum px-2 py-2 text-right";

/** Andamento di un giocatore partita per partita (Dunkest), con la squadra della lega che lo ha in rosa. */
export default async function PlayerPage(props: PageProps<"/giocatori/[id]">) {
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const [players, league, dunkest, lines] = await Promise.all([loadPlayers(), loadLeague(), loadDunkest(), loadPlayerGames(id)]);
  const p = players.find((x) => x.id === id);
  if (!p) notFound();

  const colors = teamColors(league.teams.map((t) => t.team.id));
  const owner = p.ownerTeamId ? league.teams.find((t) => t.team.id === p.ownerTeamId) : null;
  const injury = dunkest.injuries.get(id);
  const summary = summarizeGames(lines);
  const games = [...lines].reverse();

  return (
    <>
      <PageTitle
        icon="jersey"
        eyebrow={p.nbaTeam ?? "Squadra NBA n.d."}
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PosChip pos={p.pos} />
            {owner ? (
              <Link href={`/squadre/${owner.team.id}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
                <TeamCrest name={owner.team.name} color={colors.get(owner.team.id) ?? "#555"} size="xs" />
                In rosa a {owner.team.name}
              </Link>
            ) : (
              <span>Non è in nessuna rosa della lega</span>
            )}
            {injury && <InjuryChip injury={injury} size="md" />}
          </span>
        }
        aside={
          summary && (
            <Scoreboard
              items={[
                { label: "PDK medio", value: fmt(summary.avg), tone: "gold" },
                { label: "Partite", value: summary.games },
                { label: "Ultime 5", value: fmt(summary.last5) },
              ]}
            />
          )
        }
      >
        {p.name}
      </PageTitle>

      {!summary ? (
        <Empty title="Nessuna partita letta" icon="chart">
          Il job delle 9 non ha ancora salvato partite di questo giocatore, oppure non ha ancora giocato in questa stagione.
        </Empty>
      ) : (
        <>
          <section aria-label="Andamento" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-2xl leading-none font-black">Punteggio Dunkest partita per partita</h2>
              <p className={`tnum text-sm font-bold ${summary.trend > 0 ? "text-success" : summary.trend < 0 ? "text-danger" : "text-muted"}`}>
                {summary.games < 6 ? "troppo presto per l'andamento" : summary.trend === 0 ? "ultime 5 nella media" : `ultime 5 ${summary.trend > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(summary.trend))} sulla media`}
              </p>
            </div>
            <GameBars lines={lines} avg={summary.avg} />
          </section>

          <section aria-label="Partite" className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="eyebrow border-b border-line bg-surface-subtle/60 text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Giorno</th>
                  <th className={th}>PDK</th>
                  <th className={th}>Min</th>
                  <th className={th}>Pt</th>
                  <th className={th}>Rb</th>
                  <th className={th}>As</th>
                  <th className={th}>Rub</th>
                  <th className={th}>Stop</th>
                  <th className={th}>Pp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {games.map((g) => (
                  <tr key={g.date} className={g.pdk === summary.best.pdk && g.date === summary.best.date ? "bg-gold/10" : undefined}>
                    <td className="px-3 py-2 font-semibold">
                      {fmtDay(g.date)}
                      {!g.starter && <span className="ml-1.5 text-xs font-normal text-muted">dalla panchina</span>}
                    </td>
                    <td className={`${td} font-display text-lg font-black text-brand-blue`}>{fmt(g.pdk)}</td>
                    <td className={td}>{fmt(g.min)}</td>
                    <td className={td}>{g.pts}</td>
                    <td className={td}>{g.reb}</td>
                    <td className={td}>{g.ast}</td>
                    <td className={td}>{g.stl}</td>
                    <td className={td}>{g.blk}</td>
                    <td className={td}>{g.tov}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DunkestSource dunkest={dunkest} />
        <span className="text-xs text-muted">
          Date americane · aggiornato ogni mattina ·{" "}
          <Link href="/giocatori" className="font-semibold text-brand-blue hover:underline">
            torna al listone
          </Link>
        </span>
      </div>
    </>
  );
}
