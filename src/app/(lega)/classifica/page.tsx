import Link from "next/link";
import { Lineup, LeagueSource, MatchScore, StandingsTable, type TeamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { MatchdayStrip } from "@/components/matchday-strip";
import { Badge, Empty, PageTitle, Scoreboard, Section, stagger } from "@/components/ui";
import { checkLineup, rosterRefs, type LineupPlayer } from "@/lib/dunkest-league";
import type { TeamView } from "@/lib/league";
import { loadLeague, loadLeagueDunkest, loadLineups, loadProfile } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

const STATE_TEXT = { played: "Giocata", latest: "Ultima giornata con punti", upcoming: "Da giocare" } as const;

/**
 * Classifica, calendario e formazioni della lega su Dunkest (issue #72), dal job giornaliero. La giornata scelta sta nell'URL
 * (`?giornata=N`); di default l'ultima con punti. Ogni scontro iniziato si apre sulle due formazioni, confrontate con le rose
 * dell'app.
 */
export default async function StandingsPage(props: PageProps<"/classifica">) {
  const sp = await props.searchParams;
  const [view, league, profile] = await Promise.all([loadLeagueDunkest(), loadLeague(), loadProfile()]);
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams: TeamIndex = new Map(league.teams.map((t) => [t.team.id, { name: t.team.name, owner: t.team.owner_name, color: colors.get(t.team.id) ?? "var(--muted)" }]));
  const myTeamId = profile?.team_id ?? null;

  const asked = Number(Array.isArray(sp.giornata) ? sp.giornata[0] : sp.giornata);
  const fallback = view.latest ?? view.matchdays.find((d) => d.state === "upcoming")?.matchday ?? view.matchdays[0]?.matchday ?? null;
  const selected = view.matchdays.find((d) => d.matchday === asked) ?? view.matchdays.find((d) => d.matchday === fallback) ?? null;
  const lineups = selected ? await loadLineups(selected.matches.map((m) => m.id)) : new Map<number, Map<string, LineupPlayer[]>>();
  const rosters = rosterRefs(league.teams);
  const byTeam = new Map(league.teams.map((t) => [t.team.id, t]));

  const leader = view.standings[0];
  const mine = view.standings.find((s) => s.teamId === myTeamId);
  const sideOf = (teamId: string, lineup: LineupPlayer[]) => {
    const t = byTeam.get(teamId) as TeamView | undefined;
    const starters = t?.starters ?? [];
    const check = checkLineup(teamId, lineup, starters.map((p) => p.playerId), rosters);
    const stands = check.stands.map((id) => starters.find((p) => p.playerId === id)!).map((p) => ({ id: p.playerId, name: p.name, pos: p.pos }));
    return { check, stands };
  };

  return (
    <>
      <PageTitle
        icon="trophy"
        eyebrow="Lega su Dunkest · testa a testa"
        sub="Classifica, calendario e formazioni schierate su Dunkest, aggiornati ogni mattina. Le formazioni si confrontano con le rose dell'app: un giocatore che non torna ha un avviso."
        aside={
          <Scoreboard
            items={[
              { label: "Giornata", value: view.latest ?? "–" },
              { label: "In testa", value: leader ? (teams.get(leader.teamId)?.name ?? "–") : "–" },
              ...(mine ? [{ label: "La tua", value: `${mine.position}°`, tone: "gold" as const }] : []),
            ]}
          />
        }
      >
        Classifica
      </PageTitle>

      {!view.available ? (
        <Empty title="Dati non disponibili" icon="trophy">
          Classifica e calendario di Dunkest non si leggono in questo momento. Rose e contratti sono aggiornati.
        </Empty>
      ) : view.standings.length === 0 ? (
        <Empty title="Ancora niente da Dunkest" icon="clock">
          Classifica e calendario arrivano col primo aggiornamento della lega.
          <span className="mt-3 flex justify-center">
            <LeagueSource league={view} />
          </span>
        </Empty>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div>
            <Section title="Classifica" icon="trophy" aside="punti totali e record">
              <StandingsTable league={view} teams={teams} myTeamId={myTeamId} />
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <LeagueSource league={view} />
                <span className="text-xs text-muted">V–P = vittorie e sconfitte negli scontri · forma = ultime giornate chiuse</span>
              </div>
            </Section>
          </div>

          <div>
            <Section title="Calendario" icon="clock" aside={`${view.matchdays.length} giornate`}>
              {selected ? (
                <>
                  <MatchdayStrip days={view.matchdays.map((d) => ({ matchday: d.matchday, state: d.state }))} selected={selected.matchday} hrefBase="/classifica" />
                  <div className="mt-4 mb-3 flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-4xl leading-none font-black">Giornata {selected.matchday}</h3>
                    <span className="text-xs font-semibold text-muted">{STATE_TEXT[selected.state]}</span>
                  </div>
                  <ol className="space-y-2.5">
                    {selected.matches.map((m, i) => {
                      const byTeamLineup = lineups.get(m.id);
                      const sides = byTeamLineup
                        ? [m.homeTeamId, m.awayTeamId].map((id) => ({ teamId: id, ...sideOf(id, byTeamLineup.get(id) ?? []) }))
                        : null;
                      const issues = sides ? sides.reduce((n, s) => n + s.check.issues.length, 0) : 0;
                      const involved = m.homeTeamId === myTeamId || m.awayTeamId === myTeamId;
                      const card = `rise rounded-2xl border bg-surface ${involved ? "border-gold/60" : "border-line"}`;
                      if (!sides) {
                        return (
                          <li key={m.id} className={`${card} px-4 py-3`} style={stagger(i)}>
                            <MatchScore match={m} teams={teams} myTeamId={myTeamId} live={selected.state === "latest"} />
                          </li>
                        );
                      }
                      return (
                        <li key={m.id} className={card} style={stagger(i)}>
                          <details className="group">
                            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-surface-subtle/50 [&::-webkit-details-marker]:hidden">
                              <div className="min-w-0 flex-1">
                                <MatchScore match={m} teams={teams} myTeamId={myTeamId} live={selected.state === "latest"} />
                              </div>
                              <span className="flex shrink-0 flex-col items-center gap-1 border-l border-line pl-3 text-muted">
                                <Icon name="jersey" size={18} />
                                <span className="text-[0.625rem] font-bold tracking-wide uppercase">Formazioni</span>
                                <Icon name="chevron" size={14} className="transition-transform group-open:rotate-90" />
                              </span>
                            </summary>
                            {issues > 0 && (
                              <div className="px-4 pb-1">
                                <Badge tone="warn" icon="alert">
                                  {issues} {issues === 1 ? "giocatore non torna" : "giocatori non tornano"} con le rose
                                </Badge>
                              </div>
                            )}
                            <div className="grid gap-6 border-t border-line px-4 py-4 sm:grid-cols-2">
                              {sides.map((s) => (
                                <div key={s.teamId} className="min-w-0">
                                  <Link href={`/squadre/${s.teamId}`} className="font-display mb-2 block truncate text-2xl leading-none font-black hover:underline">
                                    {teams.get(s.teamId)?.name ?? "?"}
                                  </Link>
                                  <Lineup check={s.check} stands={s.stands} teams={teams} columns={false} />
                                </div>
                              ))}
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ol>
                  {selected.state === "latest" && (
                    <p className="mt-3 text-xs text-muted">I punti dell&apos;ultima giornata possono cambiare finché non si chiude: si aggiornano ogni mattina.</p>
                  )}
                  {selected.state === "upcoming" && <p className="mt-3 text-xs text-muted">Le formazioni compaiono quando la giornata comincia.</p>}
                </>
              ) : (
                <Empty title="Calendario vuoto" icon="clock">
                  Il calendario arriva col primo aggiornamento della lega.
                </Empty>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
