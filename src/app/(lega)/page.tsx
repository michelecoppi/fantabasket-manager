import Link from "next/link";
import { MatchdayCard } from "@/components/matchday-card";
import { CapLine } from "@/components/cap-line";
import { ChipLinks } from "@/components/chips";
import { CountUp } from "@/components/count-up";
import { DunkestLogo } from "@/components/dunkest";
import { LeagueSource, StandingsTable, fpt, teamIndex } from "@/components/dunkest-league";
import { TeamCrest } from "@/components/crest";
import { Icon, type IconName } from "@/components/icons";
import { Badge, Empty, Scoreboard, stagger } from "@/components/ui";
import { fmt, fmtEuro } from "@/lib/format";
import { matchdayAwards } from "@/lib/awards";
import { teamMatch, type DunkestLeagueView } from "@/lib/dunkest-league";
import { loadDunkest, loadLeague, loadLeagueDunkest, loadLineups, loadProfile } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";
import { listTeams, parseTeamListOptions, type TeamFilter, type TeamListOptions, type TeamSort } from "@/lib/teams-list";

/** Link del board con ordinamento/filtro; i valori di default restano fuori dall'URL. */
function boardHref(o: TeamListOptions) {
  const q = new URLSearchParams();
  if (o.sort !== "nome") q.set("ordina", o.sort);
  if (o.filter !== "tutte") q.set("mostra", o.filter);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

function PulseTile({ icon, label, value, tone, i }: { icon: IconName; label: string; value: string; tone?: "bad" | "warn" | "good"; i: number }) {
  const color = tone === "bad" ? "text-danger bg-danger/10" : tone === "warn" ? "text-warning bg-warning/12" : tone === "good" ? "text-success bg-success/10" : "text-brand-blue bg-brand-blue/10";
  return (
    <div className="rise flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 sm:p-4" style={stagger(i)}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${color}`}>
        <Icon name={icon} size={20} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="font-display tnum text-3xl leading-none font-black">{value}</div>
        <div className="mt-1 line-clamp-2 text-xs leading-tight font-semibold text-muted">{label}</div>
      </div>
    </div>
  );
}

export default async function Home(props: PageProps<"/">) {
  const options = parseTeamListOptions(await props.searchParams);
  // Fase 6.1: MVP dell'ultima giornata chiusa (l'ultima con punti può essere in corso), se ne ha le formazioni. Le formazioni
  // si leggono appena arriva il calendario, in parallelo con il resto (non dopo).
  const mvpOf = async (v: DunkestLeagueView) => {
    const day = v.matchdays.findLast((d) => d.state === "played");
    if (!day) return null;
    const award = matchdayAwards(day.matches, await loadLineups(day.matches.map((m) => m.id))).find((a) => a.kind === "mvp");
    return award ? { award, matchday: day.matchday } : null;
  };
  const [league, profile, dunkest, view, mvp] = await Promise.all([
    loadLeague(),
    loadProfile(),
    loadDunkest(),
    loadLeagueDunkest(),
    loadLeagueDunkest().then(mvpOf),
  ]);
  // Infortunati di ogni rosa secondo Dunkest (issue #68).
  const injuredOf = (t: (typeof league.teams)[number]) => [...t.starters, ...t.reserves].filter((p) => dunkest.injuries.has(p.playerId));
  const { settings } = league;
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams = listTeams(league.teams, options);
  const myTeam = league.teams.find((t) => t.team.id === profile?.team_id);
  const overCap = league.teams.filter((t) => t.finance.overCap).length;
  const belowFloor = league.teams.filter((t) => t.finance.belowFloor).length;
  const incomplete = league.teams.filter((t) => t.warnings.length > 0).length;
  const taxDue = league.teams.reduce((sum, t) => sum + (t.luxuryTaxPaid ? 0 : t.finance.luxuryTaxEur), 0);
  const myPicks = myTeam ? league.picks.filter((p) => p.current_team_id === myTeam.team.id).length : 0;
  const startersTotal = settings.starters.G + settings.starters.A + settings.starters.C;
  const count = (filter: TeamFilter) => listTeams(league.teams, { sort: "nome", filter }).length;
  // Lega su Dunkest (issue #72): classifica e ultima giornata, se il job le ha già scritte.
  const index = teamIndex(league.teams, colors);
  const hasStandings = view.available && view.standings.length > 0;
  const latestDay = view.matchdays.find((d) => d.state === "latest");
  const myStanding = myTeam ? view.standings.find((s) => s.teamId === myTeam.team.id) : undefined;
  const myLatest = myTeam ? teamMatch(view, myTeam.team.id, "latest") : null;

  const sorts: { value: TeamSort; label: string }[] = [
    { value: "nome", label: "Nome" },
    { value: "monte", label: "Monte ingaggi" },
    { value: "spazio", label: "Spazio" },
  ];
  const filters: { value: TeamFilter; label: string }[] = [
    { value: "tutte", label: "Tutte" },
    { value: "sforate", label: "Sforate" },
    { value: "floor", label: "Sotto floor" },
    { value: "incomplete", label: "Rose incomplete" },
  ];

  return (
    <>
      <section className="arena sweep -mx-4 sm:mx-0 sm:rounded-3xl lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]" aria-labelledby="dashboard-title">
        <div className="relative z-[2] flex flex-col px-5 py-8 sm:px-9 sm:py-10 lg:px-11 lg:py-12">
          <p className="rise eyebrow flex items-center gap-2 text-white/60">
            <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_var(--gold)]" />
            Front office · Stagione {league.seasonYear}
          </p>
          <h1 id="dashboard-title" className="rise font-display mt-5 text-[clamp(3.6rem,8.5vw,7.25rem)] leading-[0.86] font-black tracking-[-0.01em]" style={stagger(1)}>
            <span className="block">Il cap detta</span>
            <span className="outline-text mt-2 block text-highlight sm:mt-3">il gioco.</span>
          </h1>
          <p className="rise mt-6 max-w-md text-sm leading-6 text-white/70 sm:text-base" style={stagger(2)}>
            Payroll, contratti e pick delle {league.teams.length} franchigie. Ogni mossa di mercato parte da qui.
          </p>
          <div className="rise mt-7 flex flex-wrap gap-3" style={stagger(3)}>
            <Link
              href="/scambio"
              className="group font-display inline-flex min-h-12 items-center gap-2 rounded-lg bg-gold px-5 text-lg font-extrabold text-nav shadow-[0_10px_30px_-12px_var(--gold)] transition-[filter,transform] hover:brightness-105 active:scale-[0.97]"
            >
              <Icon name="swap" size={19} strokeWidth={2.2} />
              Simula uno scambio
              <Icon name="arrow-right" size={18} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/giocatori"
              className="font-display inline-flex min-h-12 items-center gap-2 rounded-lg border border-white/25 px-5 text-lg font-extrabold transition-colors hover:border-white hover:bg-white/8"
            >
              <Icon name="jersey" size={19} />
              Apri il listone
            </Link>
          </div>
          <div className="rise mt-9" style={stagger(4)}>
            <Scoreboard
              items={[
                { label: "Cap base", value: fmt(settings.cap) },
                { label: "Salary floor", value: fmt(settings.cap - settings.cap / settings.floorDivisor) },
                { label: "Riserve", value: fmt(settings.reserveBudget) },
              ]}
            />
          </div>
        </div>

        <div className="relative z-[2] border-t border-white/10 bg-brand-blue/[0.04] px-5 py-8 dark:bg-black/20 backdrop-blur-[2px] sm:px-9 lg:border-t-0 lg:border-l lg:px-9 lg:py-12">
          {myTeam ? (
            <div className="flex h-full flex-col justify-center">
              <div className="flex items-center gap-4">
                <span className="pop" style={stagger(2)}>
                  <TeamCrest name={myTeam.team.name} color={colors.get(myTeam.team.id) ?? "#1d47b5"} size="lg" mine />
                </span>
                <div className="min-w-0">
                  <p className="eyebrow text-highlight">La tua franchigia</p>
                  <Link href={`/squadre/${myTeam.team.id}`} className="font-display mt-1 block truncate text-4xl leading-none font-black hover:underline">
                    {myTeam.team.name}
                  </Link>
                  <p className="mt-1 truncate text-sm text-white/60">{myTeam.team.owner_name}</p>
                </div>
              </div>
              <div className="my-7 rounded-2xl border border-white/10 bg-board px-5 py-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
                <p className="eyebrow text-white/60">{myTeam.finance.overCap ? "Oltre il cap" : "Spazio salariale"}</p>
                <p className={`font-display tnum mt-1 text-[clamp(4.5rem,11vw,7rem)] leading-[0.85] font-black ${myTeam.finance.overCap ? "text-arena-bad" : "jumbo"}`}>
                  <CountUp value={myTeam.finance.capSpace} />
                </p>
                <p className="mt-2 mb-4 text-xs text-white/55">crediti · cap effettivo {fmt(myTeam.finance.effectiveCap)}</p>
                <CapLine payroll={myTeam.finance.payroll} cap={myTeam.finance.effectiveCap} floor={myTeam.finance.floor} dark />
              </div>
              {myStanding && (
                <Link
                  href={`/squadre/${myTeam.team.id}#formazione`}
                  className="group mb-2 -mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm transition-colors hover:border-white/25 hover:bg-white/8"
                >
                  <span className="font-display tnum grid h-[22px] min-w-[22px] place-items-center rounded-md bg-gold px-1 text-base leading-none font-black text-nav">{myStanding.position}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold text-white">{myStanding.position}° in classifica</span>
                    <span className="text-white/60">
                      {" "}
                      · {myStanding.wins}–{myStanding.losses}
                      {myLatest && myLatest.match.homePts !== null && myLatest.match.awayPts !== null && (
                        <>
                          {" "}
                          · G{myLatest.matchday}{" "}
                          {fpt(myLatest.match.homeTeamId === myTeam.team.id ? myLatest.match.homePts : myLatest.match.awayPts)}–
                          {fpt(myLatest.match.homeTeamId === myTeam.team.id ? myLatest.match.awayPts : myLatest.match.homePts)}
                        </>
                      )}
                    </span>
                  </span>
                  <Icon name="arrow-right" size={16} strokeWidth={2.2} className="shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
              {dunkest.available && (
                <Link
                  href={`/squadre/${myTeam.team.id}#infermeria`}
                  className="group mb-5 -mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm transition-colors hover:border-white/25 hover:bg-white/8"
                >
                  <DunkestLogo size={22} />
                  <span className="min-w-0 flex-1 truncate">
                    {injuredOf(myTeam).length === 0 ? (
                      <span className="text-white/75">Nessun infortunato nella tua rosa</span>
                    ) : (
                      <>
                        <span className="font-bold text-arena-bad">
                          {injuredOf(myTeam).length} {injuredOf(myTeam).length === 1 ? "infortunato" : "infortunati"}
                        </span>
                        <span className="text-white/60"> · {injuredOf(myTeam).map((p) => p.name.split(" ").at(-1)).join(", ")}</span>
                      </>
                    )}
                  </span>
                  <Icon name="arrow-right" size={16} strokeWidth={2.2} className="shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="eyebrow text-white/55">Titolari</dt>
                  <dd className="font-display tnum mt-0.5 text-4xl leading-none font-black">
                    {myTeam.starters.length}
                    <span className="text-xl text-white/40">/{startersTotal}</span>
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-white/55">Riserve</dt>
                  <dd className="font-display tnum mt-0.5 text-4xl leading-none font-black">{myTeam.reserves.length}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-white/55">Pick</dt>
                  <dd className="font-display tnum mt-0.5 text-4xl leading-none font-black">{myPicks}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <p className="eyebrow text-highlight">League pulse</p>
              <h2 className="font-display mt-2 text-6xl leading-[0.85] font-black">
                La lega
                <br />
                in numeri.
              </h2>
              <dl className="my-7 divide-y divide-white/12 border-y border-white/12">
                {[
                  ["Franchigie", league.teams.length],
                  ["Sopra il cap", overCap],
                  ["Rose da completare", incomplete],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-end justify-between gap-4 py-4">
                    <dt className="text-sm text-white/60">{label}</dt>
                    <dd className="font-display tnum text-5xl leading-none font-black">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-auto text-sm leading-6 text-white/55">Il board mette a confronto budget e asset. Non è una classifica di campionato.</p>
            </div>
          )}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Situazione della lega">
        <PulseTile i={1} icon="flame" label="Sopra il cap" value={String(overCap)} tone={overCap > 0 ? "bad" : "good"} />
        <PulseTile i={2} icon="alert" label="Sotto il salary floor" value={String(belowFloor)} tone={belowFloor > 0 ? "warn" : "good"} />
        <PulseTile i={3} icon="clipboard" label="Rose incomplete" value={String(incomplete)} tone={incomplete > 0 ? "warn" : "good"} />
        <PulseTile i={4} icon="coins" label="Luxury tax da incassare" value={`${fmtEuro(taxDue)} €`} />
      </div>

      {hasStandings && (
        <section className="mt-12" aria-labelledby="league-standings-title">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <p className="eyebrow text-muted">Lega su Dunkest{view.latest ? ` · giornata ${view.latest}` : ""}</p>
              <h2 id="league-standings-title" className="font-display mt-1 text-5xl leading-none font-black">
                Il campionato
              </h2>
            </div>
            <Link href="/classifica" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-blue">
              Classifica, andamento e premi
              <Icon name="arrow-right" size={16} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <StandingsTable league={view} teams={index} myTeamId={myTeam?.team.id} compact />
            {latestDay && (
              <MatchdayCard day={latestDay} mvp={mvp} teams={index} myTeamId={myTeam?.team.id ?? null} />
            )}
          </div>
          <div className="mt-3">
            <LeagueSource league={view} />
          </div>
        </section>
      )}

      <section className="mt-12" aria-labelledby="league-board-title">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="eyebrow text-muted">League board · {league.seasonYear}</p>
            <h2 id="league-board-title" className="font-display mt-1 text-5xl leading-none font-black">
              Squadra per squadra
            </h2>
          </div>
          <p className="text-xs font-semibold text-muted">
            {teams.length} di {league.teams.length} franchigie · non è una classifica
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-y border-line py-3 lg:flex-row lg:items-center lg:justify-between">
          <ChipLinks label="Ordina" options={sorts.map((s) => ({ href: boardHref({ ...options, sort: s.value }), label: s.label, active: options.sort === s.value }))} />
          <ChipLinks
            label="Mostra"
            options={filters.map((f) => ({ href: boardHref({ ...options, filter: f.value }), label: f.label, active: options.filter === f.value, count: count(f.value) }))}
          />
        </div>

        {teams.length === 0 ? (
          <div className="mt-6">
            <Empty title="Nessuna franchigia trovata" icon="search">
              Cambia il filtro oppure{" "}
              <Link href="/" className="font-semibold text-brand-blue underline underline-offset-4">
                torna alla panoramica completa
              </Link>
              .
            </Empty>
          </div>
        ) : (
          <>
            <div className="eyebrow hidden grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(6rem,0.5fr))] gap-6 px-5 pt-5 pb-2 text-muted md:grid">
              <span>Franchigia · cap effettivo</span>
              <span className="text-right">Payroll</span>
              <span className="text-right">Spazio</span>
              <span className="text-right">Riserve</span>
            </div>
            <ul className="mt-3 space-y-2.5 md:mt-0">
              {teams.map((t, i) => {
                const f = t.finance;
                const mine = profile?.team_id === t.team.id;
                const color = colors.get(t.team.id) ?? "#1d47b5";
                return (
                  <li key={t.team.id} className="rise" style={stagger(i)}>
                    <Link
                      href={`/squadre/${t.team.id}`}
                      className={`group lift relative block overflow-hidden rounded-2xl border bg-surface px-4 py-4 sm:px-5 ${mine ? "border-gold/70 ring-1 ring-gold/40" : "border-line hover:border-foreground/25"}`}
                    >
                      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{ background: `linear-gradient(90deg, color-mix(in oklab, ${color} 10%, transparent), transparent 55%)` }}
                      />
                      <div className="relative grid gap-4 md:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(6rem,0.5fr))] md:items-center md:gap-6">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <TeamCrest name={t.team.name} color={color} size="md" mine={mine} morphId={t.team.id} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h3 className="font-display truncate text-[1.5rem] leading-none font-black sm:text-[1.75rem]">{t.team.name}</h3>
                                {mine && (
                                  <Badge tone="gold" icon="crown">
                                    La tua
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 truncate text-xs text-muted">
                                {t.team.owner_name} · bonus {t.bonus > 0 ? "+" : ""}
                                {t.bonus}
                              </p>
                            </div>
                            <Icon name="chevron" size={18} className="ml-auto shrink-0 text-muted transition-transform group-hover:translate-x-1 md:hidden" />
                          </div>
                          <div className="mt-4 max-w-md">
                            <CapLine payroll={f.payroll} cap={f.effectiveCap} floor={f.floor} />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {f.overCap && (
                              <Badge tone="bad" icon="flame">
                                Budget sforato
                              </Badge>
                            )}
                            {f.belowFloor && (
                              <Badge tone="warn" icon="alert" title={`Sotto il salary floor (${fmt(f.floor)})`}>
                                Sotto floor
                              </Badge>
                            )}
                            {t.warnings.length > 0 && (
                              <Badge title={t.warnings.join(" · ")} icon="clipboard">
                                Rosa incompleta
                              </Badge>
                            )}
                            <Badge tone={t.entryFeePaid ? "good" : "neutral"} icon={t.entryFeePaid ? "check" : "coins"}>
                              Quota {t.entryFeePaid ? "pagata" : "da pagare"}
                            </Badge>
                            {injuredOf(t).length > 0 && (
                              <Badge tone="bad" icon="medkit" title={injuredOf(t).map((p) => p.name).join(", ")}>
                                {injuredOf(t).length} {injuredOf(t).length === 1 ? "infortunato" : "infortunati"}
                              </Badge>
                            )}
                            {f.luxuryTaxEur > 0 && (
                              <Badge tone={t.luxuryTaxPaid ? "good" : "bad"} icon="coins">
                                Luxury tax {fmtEuro(f.luxuryTaxEur)} € {t.luxuryTaxPaid ? "pagata" : "da pagare"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-subtle/70 p-3 md:contents">
                          <div className="md:text-right">
                            <div className="eyebrow text-muted md:hidden">Payroll</div>
                            <div className="font-display tnum text-3xl leading-none font-black md:text-4xl">{fmt(f.payroll)}</div>
                          </div>
                          <div className="md:text-right">
                            <div className="eyebrow text-muted md:hidden">Spazio</div>
                            <div className={`font-display tnum text-3xl leading-none font-black md:text-4xl ${f.overCap ? "text-danger" : "text-success"}`}>{fmt(f.capSpace)}</div>
                          </div>
                          <div className="md:text-right">
                            <div className="eyebrow text-muted md:hidden">Riserve</div>
                            <div className="font-display tnum text-3xl leading-none font-black md:text-4xl">{fmt(f.reserveSpace)}</div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
