import Link from "next/link";
import { AwardsGrid } from "@/components/awards";
import { ChipLinks, ViewSwitch } from "@/components/chips";
import { Lineup, LeagueSource, MatchScore, StandingsTable, teamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { MatchdayCard } from "@/components/matchday-card";
import { MatchdayStrip } from "@/components/matchday-strip";
import { PrecedentsLine } from "@/components/rivalries";
import { StandingsChart } from "@/components/standings-chart";
import { Badge, Empty, PageTitle, Scoreboard, Section, stagger } from "@/components/ui";
import { hasPlayerAwards, matchdayAwards } from "@/lib/awards";
import { checkLineup, rosterRefs, tribune, type DunkestLeagueView, type LineupPlayer, type MatchdayView } from "@/lib/dunkest-league";
import type { TeamView } from "@/lib/league";
import { loadDunkestRosters, loadLeague, loadLeagueDunkest, loadLineups, loadProfile } from "@/lib/league-server";
import { precedents } from "@/lib/rivalries";
import { checkOfficial, standingsByMatchday } from "@/lib/standings-history";
import { teamColors } from "@/lib/team-colors";

const STATE_TEXT = { played: "Giocata", latest: "Ultima giornata con punti", upcoming: "Da giocare" } as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Tab = "classifica" | "andamento" | "calendario" | "premi";
const TABS: Tab[] = ["classifica", "andamento", "calendario", "premi"];

/**
 * Giornata scelta (`?giornata=N`, altrimenti l'ultima con punti; per i premi l'ultima chiusa, perché l'ultima con punti di solito
 * è appena cominciata), ultima giornata chiusa e giornata di cui servono le formazioni: la scelta per calendario e premi,
 * l'ultima chiusa per l'MVP della scheda Classifica.
 */
function pickDays(view: DunkestLeagueView, tab: Tab, asked: number) {
  const fallback = view.latest ?? view.matchdays.find((d) => d.state === "upcoming")?.matchday ?? view.matchdays[0]?.matchday ?? null;
  const lastPlayed = view.matchdays.findLast((d) => d.state === "played") ?? null;
  const start = tab === "premi" ? (lastPlayed?.matchday ?? fallback) : fallback;
  const selected = view.matchdays.find((d) => d.matchday === asked) ?? view.matchdays.find((d) => d.matchday === start) ?? null;
  const lineupDay: MatchdayView | null = tab === "calendario" || tab === "premi" ? selected : tab === "classifica" ? lastPlayed : null;
  return { selected, lastPlayed, lineupDay };
}

/**
 * Classifica, andamento, calendario e premi della lega su Dunkest (issue #72 e Fase 6), dal job giornaliero, in quattro
 * schede (`?vista=`, di default la classifica). La giornata scelta sta nell'URL (`?giornata=N`, di default l'ultima con punti)
 * e vale per calendario e premi; il grafico ha la sua vista (`?andamento=punti`) e la squadra in evidenza (`?evidenzia=<id>`,
 * di default la mia). Ogni scontro iniziato si apre sulle due formazioni, confrontate con le rose dell'app.
 */
export default async function StandingsPage(props: PageProps<"/classifica">) {
  const sp = await props.searchParams;
  const tab: Tab = TABS.find((t) => t === one(sp.vista)) ?? "classifica";
  const asked = Number(one(sp.giornata));
  // Le formazioni dipendono solo dal calendario: si leggono appena arriva, in parallelo con lega e profilo.
  const lineupsOf = (v: DunkestLeagueView) => {
    const { lineupDay } = pickDays(v, tab, asked);
    return lineupDay ? loadLineups(lineupDay.matches.map((m) => m.id)) : new Map<number, Map<string, LineupPlayer[]>>();
  };
  const [view, league, profile, dunkestRosters, lineups] = await Promise.all([
    loadLeagueDunkest(),
    loadLeague(),
    loadProfile(),
    loadDunkestRosters(),
    loadLeagueDunkest().then(lineupsOf),
  ]);
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams = teamIndex(league.teams, colors);
  const myTeamId = profile?.team_id ?? null;

  const latestDay = view.matchdays.find((d) => d.state === "latest") ?? null;
  const { selected, lastPlayed } = pickDays(view, tab, asked);
  const rosters = rosterRefs(league.teams);
  const byTeam = new Map(league.teams.map((t) => [t.team.id, t]));

  const awards = selected && selected.state !== "upcoming" && tab === "premi" ? matchdayAwards(selected.matches, lineups) : [];
  const mvp = tab === "classifica" && lastPlayed ? matchdayAwards(lastPlayed.matches, lineups).find((a) => a.kind === "mvp") : undefined;
  const history = standingsByMatchday(view);
  const official = checkOfficial(history, view.standings);
  const mode = one(sp.andamento) === "punti" ? "points" : "position";
  const asks = one(sp.evidenzia);
  const highlight = asks && teams.has(asks) ? asks : myTeamId;

  const tabHref = (t: Tab, extra: Record<string, string | null | undefined> = {}) => {
    const q = new URLSearchParams();
    if (t !== "classifica") q.set("vista", t);
    if ((t === "calendario" || t === "premi") && one(sp.giornata) && selected) q.set("giornata", String(selected.matchday));
    if (t === "andamento") {
      const m = extra.andamento ?? (mode === "points" ? "punti" : undefined);
      if (m && m !== "posizione") q.set("andamento", m);
      const h = extra.evidenzia === undefined ? asks : extra.evidenzia;
      if (h && h !== myTeamId) q.set("evidenzia", h);
    }
    const s = q.toString();
    return `/classifica${s ? `?${s}` : ""}`;
  };

  const leader = view.standings[0];
  const mine = view.standings.find((s) => s.teamId === myTeamId);
  const sideOf = (teamId: string, lineup: LineupPlayer[]) => {
    const t = byTeam.get(teamId) as TeamView | undefined;
    const starters = t?.starters ?? [];
    const check = checkLineup(teamId, lineup, starters.map((p) => p.playerId), rosters, dunkestRosters.get(teamId));
    return { check, stands: tribune(lineup, dunkestRosters.get(teamId), starters, check) };
  };

  const strip = (vista: "calendario" | "premi") =>
    selected && (
      <>
        <MatchdayStrip days={view.matchdays.map((d) => ({ matchday: d.matchday, state: d.state }))} selected={selected.matchday} hrefBase="/classifica" query={`vista=${vista}`} />
        <div className="mt-4 mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-4xl leading-none font-black">Giornata {selected.matchday}</h2>
          <span className="text-xs font-semibold text-muted">{STATE_TEXT[selected.state]}</span>
        </div>
      </>
    );

  return (
    <>
      <PageTitle
        icon="trophy"
        eyebrow="Lega su Dunkest · testa a testa"
        sub="Classifica, andamento, calendario e premi della giornata, dai dati Dunkest aggiornati ogni mattina."
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
        <>
          <div className="mb-8">
            <ViewSwitch
              label="Sezioni della classifica"
              options={[
                { href: tabHref("classifica"), label: "Classifica", hint: "punti, record e forma", icon: "trophy", active: tab === "classifica" },
                { href: tabHref("andamento"), label: "Andamento", hint: "giornata per giornata", icon: "chart", active: tab === "andamento" },
                { href: tabHref("calendario"), label: "Calendario", hint: "scontri e formazioni", icon: "clock", active: tab === "calendario" },
                { href: tabHref("premi"), label: "Premi", hint: "i trofei della giornata", icon: "crown", active: tab === "premi" },
                { href: "/storia", label: "Albo d'oro", hint: "le stagioni passate", icon: "medal", active: false },
              ]}
            />
          </div>

          {tab === "classifica" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Section title="Classifica" icon="trophy" aside="punti totali e record">
                <StandingsTable league={view} teams={teams} myTeamId={myTeamId} />
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <LeagueSource league={view} />
                  <span className="text-xs text-muted">V–P = vittorie e sconfitte negli scontri · forma = ultime giornate chiuse</span>
                </div>
              </Section>
              {latestDay && (
                <Section title="La giornata" icon="ball" aside="ultima con punti">
                  <MatchdayCard day={latestDay} mvp={mvp && lastPlayed ? { award: mvp, matchday: lastPlayed.matchday } : null} teams={teams} myTeamId={myTeamId} />
                </Section>
              )}
            </div>
          )}

          {tab === "andamento" && (
            <Section title="Andamento" icon="chart" aside={history.length ? `dopo ${history.length} ${history.length === 1 ? "giornata" : "giornate"}` : undefined}>
              {history.length === 0 ? (
                <Empty title="Ancora nessuna giornata chiusa" icon="chart">
                  Il grafico parte quando si chiude la prima giornata.
                </Empty>
              ) : official === "mismatch" ? (
                <Empty title="Andamento non disponibile" icon="alert">
                  Ricostruita dagli scontri, la classifica non coincide con quella ufficiale di Dunkest: invece di mostrare un grafico sbagliato lo nascondiamo
                  finché non capiamo come Dunkest ordina le squadre (per esempio con i pareggi).
                </Empty>
              ) : (
                <div className="mx-auto max-w-5xl">
                  <div className="mb-3">
                    <ChipLinks
                      label="Mostra"
                      options={[
                        { href: tabHref("andamento", { andamento: "posizione" }), label: "Posizione", active: mode === "position" },
                        { href: tabHref("andamento", { andamento: "punti" }), label: "Punti totali", active: mode === "points" },
                      ]}
                    />
                  </div>
                  <StandingsChart history={history} teams={teams} highlight={highlight} mode={mode} hrefFor={(id) => tabHref("andamento", { evidenzia: id })} />
                  <p className="mt-3 text-xs text-muted">
                    Ricostruito dagli scontri delle giornate chiuse, ordinando come Dunkest (vittorie, poi punti totali). Tocca una squadra nella legenda per
                    metterla in evidenza.
                    {official === "pending" && " La classifica ufficiale conta già la giornata in corso: il grafico si ferma all'ultima chiusa."}
                  </p>
                </div>
              )}
            </Section>
          )}

          {tab === "calendario" &&
            (selected ? (
              <section aria-label="Calendario">
                {strip("calendario")}
                <ol className="grid items-start gap-2.5 lg:grid-cols-2">
                  {selected.matches.map((m, i) => {
                    const byTeamLineup = lineups.get(m.id);
                    const sides = byTeamLineup ? [m.homeTeamId, m.awayTeamId].map((id) => ({ teamId: id, ...sideOf(id, byTeamLineup.get(id) ?? []) })) : null;
                    const issues = sides ? sides.reduce((n, s) => n + s.check.issues.length, 0) : 0;
                    const involved = m.homeTeamId === myTeamId || m.awayTeamId === myTeamId;
                    const card = `rise rounded-2xl border bg-surface ${involved ? "border-gold/60" : "border-line"}`;
                    const prev = <PrecedentsLine p={precedents(view, m.homeTeamId, m.awayTeamId, selected.matchday)} homeId={m.homeTeamId} awayId={m.awayTeamId} teams={teams} />;
                    if (!sides) {
                      return (
                        <li key={m.id} className={`${card} space-y-2 px-4 py-3`} style={stagger(i)}>
                          <MatchScore match={m} teams={teams} myTeamId={myTeamId} live={selected.state === "latest"} />
                          <div className="border-t border-line pt-2">{prev}</div>
                        </li>
                      );
                    }
                    return (
                      <li key={m.id} className={card} style={stagger(i)}>
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-surface-subtle/50 [&::-webkit-details-marker]:hidden">
                            <div className="min-w-0 flex-1 space-y-2">
                              <MatchScore match={m} teams={teams} myTeamId={myTeamId} live={selected.state === "latest"} />
                              <div className="border-t border-line pt-2">{prev}</div>
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
                                <Lineup check={s.check} stands={s.stands.players} standsFromDunkest={s.stands.fromDunkest} teams={teams} columns={false} past={selected.state === "played"} />
                              </div>
                            ))}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-3 text-xs text-muted">
                  {selected.state === "latest" && "I punti dell'ultima giornata possono cambiare finché non si chiude: si aggiornano ogni mattina. "}
                  {selected.state === "upcoming" && "Le formazioni compaiono quando la giornata comincia. "}
                  Le formazioni si confrontano con le rose dell&apos;app: un giocatore che non torna ha un avviso.
                </p>
              </section>
            ) : (
              <Empty title="Calendario vuoto" icon="clock">
                Il calendario arriva col primo aggiornamento della lega.
              </Empty>
            ))}

          {tab === "premi" &&
            (selected ? (
              <section aria-label="Premi della giornata">
                {strip("premi")}
                {awards.length > 0 ? (
                  <AwardsGrid awards={awards} teams={teams} myTeamId={myTeamId} provisional={selected.state === "latest"} noLineups={!hasPlayerAwards(awards)} />
                ) : (
                  <Empty title={selected.state === "upcoming" ? "Giornata da giocare" : "Ancora nessun premio"} icon="crown">
                    {selected.state === "upcoming" ? "I premi arrivano quando la giornata comincia." : "La giornata è appena cominciata: i premi arrivano con i primi punti."}
                    {lastPlayed && lastPlayed.matchday !== selected.matchday && (
                      <span className="mt-3 flex justify-center">
                        <Link href={`/classifica?vista=premi&giornata=${lastPlayed.matchday}`} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-brand-blue hover:underline">
                          Premi della giornata {lastPlayed.matchday}
                          <Icon name="arrow-right" size={15} strokeWidth={2.2} />
                        </Link>
                      </span>
                    )}
                  </Empty>
                )}
                <p className="mt-3 text-xs text-muted">I trofei di tutta la stagione stanno nella vetrina di ogni squadra.</p>
              </section>
            ) : (
              <Empty title="Calendario vuoto" icon="crown">
                I premi arrivano col primo aggiornamento della lega.
              </Empty>
            ))}
        </>
      )}
    </>
  );
}
