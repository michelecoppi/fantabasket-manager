import Link from "next/link";
import { notFound } from "next/navigation";
import { CapLine } from "@/components/cap-line";
import { TeamCrest } from "@/components/crest";
import { DunkestSource, InjuryChip, PdkCell, PlayerSheet, SheetTrigger, sheetId } from "@/components/dunkest";
import { issuesText, LeagueSource, Lineup, MatchScore, type TeamIndex } from "@/components/dunkest-league";
import { Callout } from "@/components/controls";
import { Icon } from "@/components/icons";
import { PlayerList, PlayerRow } from "@/components/player-row";
import { RivalryList } from "@/components/rivalries";
import { RosterMovesList } from "@/components/roster-moves";
import { PositionSparkline } from "@/components/standings-chart";
import { Badge, ContractPips, Empty, PosChip, RestrictionBadge, Scoreboard, Section, stagger } from "@/components/ui";
import { TeamValue } from "@/components/value-board";
import { TrophyCase } from "@/components/trophy-case";
import { ViewSwitch } from "@/components/chips";
import { INJURY_ORDER, type DunkestView } from "@/lib/dunkest";
import { checkLineup, rosterRefs, teamMatch, tribune, type DunkestLeagueView } from "@/lib/dunkest-league";
import { fmt, fmtEuro, POS_LABEL } from "@/lib/format";
import type { LeagueView, RosterPlayer, TeamView } from "@/lib/league";
import { loadDunkest, loadDunkestRosters, loadLeague, loadLeagueDunkest, loadLineups, loadProfile, loadRosterMoves } from "@/lib/league-server";
import { teamRosterMoves } from "@/lib/roster-moves";
import { seasonTrophies } from "@/lib/awards";
import { headToHead, rivalryBadges } from "@/lib/rivalries";
import { standingsByMatchday, teamPositions } from "@/lib/standings-history";
import { teamColors } from "@/lib/team-colors";
import { teamValue, valueBoard, valueContracts } from "@/lib/value";

function Roster({ players, dunkest, offset = 0 }: { players: RosterPlayer[]; dunkest: DunkestView; offset?: number }) {
  return (
    <PlayerList>
      {players.map((p, i) => {
        const injury = dunkest.injuries.get(p.playerId);
        return (
          <PlayerRow
            key={p.id}
            i={offset + i}
            pos={p.pos}
            name={p.name}
            meta={p.nbaTeam ?? "NBA n.d."}
            badges={(p.rookie || p.restriction) && <RestrictionBadge rookie={p.rookie} restriction={p.restriction} />}
            contract={<ContractPips years={p.yearsLeft} option={p.teamOption} label={p.contractLabel} />}
            value={p.salary}
            status={injury && <InjuryChip injury={injury} />}
            score={dunkest.available && <PdkCell stats={dunkest.stats.get(p.playerId)} role={p.pos ? dunkest.roles[p.pos] : dunkest.all} />}
            sheet={dunkest.available ? { id: sheetId(p.playerId), name: p.name } : undefined}
          />
        );
      })}
    </PlayerList>
  );
}

const injuryNote = (status: string, until: string | null) =>
  status === "season" ? "fuori per la stagione" : status === "doubtful" ? "da valutare prima della partita" : until ? `rientro previsto ${until}` : "indisponibile";

/** "Infermeria": infortunati della rosa secondo Dunkest, dal più grave. Ogni voce apre la scheda del giocatore. */
function Infirmary({ players, dunkest }: { players: RosterPlayer[]; dunkest: DunkestView }) {
  const injured = players
    .flatMap((p) => {
      const injury = dunkest.injuries.get(p.playerId);
      return injury ? [{ p, injury }] : [];
    })
    .sort((a, b) => INJURY_ORDER[a.injury.status] - INJURY_ORDER[b.injury.status] || b.p.salary - a.p.salary);
  const out = injured.filter((x) => x.injury.status !== "doubtful").length;
  const doubtful = injured.length - out;
  const counts = [out > 0 && `${out} fuori`, doubtful > 0 && `${doubtful} in dubbio`].filter(Boolean).join(" · ");

  return (
    <Section title="Infermeria" icon="medkit" id="infermeria" aside={!dunkest.available ? "dati non disponibili" : counts || "nessuno"}>
      {!dunkest.available ? (
        <Empty title="Dati non disponibili" icon="medkit">
          Infortuni e punteggi Dunkest non si leggono in questo momento. Rose e contratti sono aggiornati.
        </Empty>
      ) : injured.length === 0 ? (
        <div className="rise flex items-center gap-3 rounded-2xl border border-success/30 bg-success/8 px-4 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">
            <Icon name="check" size={20} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl leading-none font-extrabold">Rosa al completo</p>
            <p className="mt-1 text-xs text-muted">Nessun giocatore nella lista infortuni di Dunkest.</p>
          </div>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {injured.map(({ p, injury }, i) => {
            const doubt = injury.status === "doubtful";
            return (
              <li
                key={p.id}
                className={`rise relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-surface py-3 pr-3 pl-4 transition-colors hover:bg-surface-subtle/60 ${doubt ? "border-warning/35" : "border-danger/30"}`}
                style={stagger(i)}
              >
                <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${doubt ? "bg-warning" : "bg-danger"}`} />
                <SheetTrigger id={sheetId(p.playerId)} name={p.name} />
                <PosChip pos={p.pos} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold">{p.name}</span>
                    <InjuryChip injury={injury} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    <span className="font-semibold text-foreground/80">{injury.injury || "Infortunio"}</span> · {injuryNote(injury.status, injury.until)}
                  </p>
                </div>
                <Icon name="chevron" size={16} className="shrink-0 text-muted" />
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DunkestSource dunkest={dunkest} />
        {dunkest.available && <span className="text-xs text-muted">PDK = punteggio medio Dunkest · pg = partite giocate · tocca un giocatore per la sua scheda</span>}
      </div>
    </Section>
  );
}

/**
 * «Formazione su Dunkest»: quintetto, panchina e tribuna della squadra nell'ultima giornata con punti (issue #72), con gli
 * avvisi quando chi è schierato non torna con le rose dell'app. Sotto, il prossimo scontro.
 */
async function DunkestLineup({
  t,
  league,
  view,
  teams,
  positions,
}: {
  t: TeamView;
  league: LeagueView;
  view: DunkestLeagueView;
  teams: TeamIndex;
  /** posizione dopo ogni giornata chiusa (Fase 6.4), per la mini linea accanto alla classifica */
  positions: { matchday: number; position: number }[];
}) {
  const id = t.team.id;
  const latest = teamMatch(view, id, "latest");
  const next = teamMatch(view, id, "next");
  const lineup = latest ? ((await loadLineups([latest.match.id])).get(latest.match.id)?.get(id) ?? []) : [];
  const dunkestRoster = (await loadDunkestRosters()).get(id);
  const check = checkLineup(id, lineup, t.starters.map((p) => p.playerId), rosterRefs(league.teams), dunkestRoster);
  const stands = tribune(lineup, dunkestRoster, t.starters, check);
  const issues = issuesText(check, teams);
  const standing = view.standings.find((s) => s.teamId === id);

  return (
    <Section title="Formazione su Dunkest" icon="jersey" id="formazione" aside={latest ? `giornata ${latest.matchday}` : undefined}>
      {!view.available ? (
        <Empty title="Dati non disponibili" icon="jersey">
          Classifica e formazioni di Dunkest non si leggono in questo momento.
        </Empty>
      ) : !latest ? (
        <Empty title="Nessuna giornata giocata" icon="clock">
          La formazione compare quando comincia la prima giornata del torneo.
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
            <Link href={`/classifica?vista=calendario&giornata=${latest.matchday}`} className="rise block rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-subtle/50">
              <span className="eyebrow mb-2 flex items-center justify-between text-muted">
                <span>Giornata {latest.matchday} · ultima con punti</span>
                <Icon name="arrow-right" size={14} strokeWidth={2.2} />
              </span>
              <MatchScore match={latest.match} teams={teams} myTeamId={id} live />
            </Link>
            {standing && (
              <Link href="/classifica" className="arena rise flex items-center gap-4 rounded-2xl px-5 py-3 transition-[filter] hover:brightness-[1.04] dark:hover:brightness-125" style={stagger(1)}>
                <span>
                  <span className="eyebrow block text-white/55">Classifica</span>
                  <span className="font-display tnum block text-5xl leading-none font-black text-highlight">{standing.position}°</span>
                </span>
                <span className="text-sm text-white/70">
                  <span className="font-display tnum block text-2xl leading-none font-extrabold text-white">
                    {standing.wins}–{standing.losses}
                  </span>
                  vittorie–sconfitte
                </span>
                <PositionSparkline points={positions} teams={view.standings.length} color="var(--jumbo)" className="ml-auto text-white/70" />
              </Link>
            )}
          </div>
          {lineup.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Formazione non ancora letta per questa giornata: arriva col prossimo aggiornamento.</p>
          ) : (
            <>
              {issues.length > 0 && (
                <Callout tone="warn" title={issues.length === 1 ? "Un giocatore schierato non torna con la rosa" : `${issues.length} giocatori schierati non tornano con la rosa`}>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {issues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              <Lineup check={check} stands={stands.players} standsFromDunkest={stands.fromDunkest} teams={teams} />
            </>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <LeagueSource league={view} />
        {next && (
          <span className="text-xs text-muted">
            Prossimo: giornata {next.matchday} contro{" "}
            <span className="font-semibold text-foreground">{teams.get(next.match.homeTeamId === id ? next.match.awayTeamId : next.match.homeTeamId)?.name}</span>
          </span>
        )}
      </div>
    </Section>
  );
}

/** Contatore di ruolo: "Guardie 4/5" con tacche piene per i posti occupati. Su telefono le tacche vanno sotto, in tre colonne uguali. */
function SlotMeter({ label, have, need }: { label: string; have: number; need: number }) {
  const ok = have === need;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <span className="order-1 flex basis-full gap-[3px] sm:order-none sm:basis-auto" aria-hidden>
        {Array.from({ length: Math.max(need, have) }, (_, i) => (
          <span key={i} className={`h-2 w-4 rounded-sm ${i < have ? (i < need ? "bg-brand-blue" : "bg-danger") : "bg-foreground/12"}`} />
        ))}
      </span>
      <span className={`tnum text-xs font-bold ${ok ? "text-success" : "text-warning"}`}>
        {have}/{need}
      </span>
    </div>
  );
}

/** Cambi di rosa di una squadra: quelli registrati e le uscite ricostruite dalle sue formazioni (giornate con punti). */
async function teamMoves(id: string, view: DunkestLeagueView) {
  const games = view.matchdays.flatMap((d) =>
    d.state === "upcoming" ? [] : d.matches.filter((m) => m.homeTeamId === id || m.awayTeamId === id).map((m) => ({ matchday: d.matchday, id: m.id })),
  );
  const [logged, lineups, rosters] = await Promise.all([loadRosterMoves(id), loadLineups(games.map((g) => g.id)), loadDunkestRosters()]);
  const fielded = games.map((g) => ({ matchday: g.matchday, players: lineups.get(g.id)?.get(id) ?? [] }));
  return teamRosterMoves(logged, fielded, rosters.get(id) ?? []);
}

type TeamTab = "rosa" | "dunkest" | "vetrina" | "pick";
const TEAM_TABS: TeamTab[] = ["rosa", "dunkest", "vetrina", "pick"];

/**
 * Pagina squadra: testata con i conti del cap, poi quattro schede (`?vista=`, di default la rosa): rosa (titolari con affare e
 * flop, infermeria, riserve), su Dunkest (formazione, andamento, rivalità), vetrina dei trofei della stagione, pick (con
 * talenti e tagli).
 */
export default async function TeamPage(props: PageProps<"/squadre/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab: TeamTab = TEAM_TABS.find((x) => x === sp.vista) ?? "rosa";
  const [league, dunkest, view, profile] = await Promise.all([loadLeague(), loadDunkest(), loadLeagueDunkest(), loadProfile()]);
  const t = league.teams.find((x) => x.team.id === id);
  if (!t) notFound();
  const f = t.finance;
  const colors = teamColors(league.teams.map((x) => x.team.id));
  const color = colors.get(id) ?? "#1d47b5";
  const name = (teamId: string | null) => (teamId ? league.teamNames.get(teamId) ?? "?" : "da definire");

  const ownPicks = league.picks.filter((p) => p.current_team_id === id);
  const ceded = league.picks.filter((p) => p.original_team_id === id && p.current_team_id !== id);
  const years = [...new Set(ownPicks.map((p) => p.year))].sort();
  const positions = ["G", "A", "C"] as const;
  const unknownPos = t.starters.filter((x) => !x.pos);
  const roster = [...t.starters, ...t.reserves];
  const injuredCount = roster.filter((p) => dunkest.injuries.has(p.playerId)).length;
  const teams: TeamIndex = new Map(league.teams.map((x) => [x.team.id, { name: x.team.name, owner: x.team.owner_name, color: colors.get(x.team.id) ?? "var(--muted)" }]));
  const standing = view.standings.find((s) => s.teamId === id);
  // Fase 6: andamento, affare e flop, rivalità (sola lettura, dati già caricati)
  const you = profile?.team_id === id;
  const trend = teamPositions(standingsByMatchday(view), id);
  const board = dunkest.available ? valueBoard(valueContracts(league.teams), dunkest.stats) : null;
  const value = board ? teamValue(board, id) : null;
  const rivals = view.available && view.standings.length > 0 ? headToHead(view, id) : [];
  // Cambi di rosa su Dunkest (scheda Su Dunkest): registrati dal job più le uscite ricostruite dalle formazioni della squadra
  const moves = tab === "dunkest" && view.available ? await teamMoves(id, view) : null;
  // Vetrina: premi di tutte le giornate chiuse (formazioni dell'intera stagione, lette solo in questa scheda)
  const closed = view.matchdays.filter((d) => d.state === "played");
  const season =
    tab === "vetrina" && view.available
      ? seasonTrophies(closed, await loadLineups(closed.flatMap((d) => d.matches.map((m) => m.id))), league.teams.map((x) => x.team.id))
      : null;

  return (
    <>
      <Link href="/" className="mt-4 mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-blue hover:underline sm:mt-0">
        <Icon name="arrow-left" size={16} strokeWidth={2.2} />
        Lega
      </Link>

      <section className="arena sweep -mx-4 sm:mx-0 sm:rounded-3xl" aria-labelledby="team-title">
        {/* luce nel colore della squadra: piena al buio, velata sulla carta del tema chiaro (il testo lì è scuro) */}
        <div aria-hidden className="absolute inset-0 -z-[1] dark:hidden" style={{ background: `radial-gradient(50rem 26rem at 0% 0%, color-mix(in oklab, ${color} 20%, transparent), transparent 65%)` }} />
        <div aria-hidden className="absolute inset-0 -z-[1] hidden dark:block" style={{ background: `radial-gradient(50rem 26rem at 0% 0%, color-mix(in oklab, ${color} 70%, transparent), transparent 65%)` }} />
        <div className="relative z-[2] grid gap-8 px-5 py-8 sm:px-9 sm:py-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex items-center gap-5 sm:gap-7">
            <TeamCrest name={t.team.name} color={color} size="xl" morphId={t.team.id} className="hidden sm:block" />
            <TeamCrest name={t.team.name} color={color} size="lg" className="sm:hidden" />
            <div className="min-w-0">
              <p className="rise eyebrow text-white/60">Franchigia · Stagione {league.seasonYear}</p>
              <h1 id="team-title" className="rise font-display mt-1 text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.85] font-black" style={stagger(1)}>
                {t.team.name}
              </h1>
              <p className="rise mt-2 text-sm text-white/65" style={stagger(2)}>
                {t.team.owner_name}
                {t.finalRank && ` · ${t.finalRank}° nella scorsa stagione`}
              </p>
            </div>
          </div>
          <div className="rise w-full lg:w-[30rem]" style={stagger(3)}>
            <Scoreboard
              items={[
                { label: "Payroll", value: fmt(f.payroll) },
                { label: `Cap ${t.bonus >= 0 ? "+" : "−"}${Math.abs(t.bonus)}`, value: fmt(f.effectiveCap) },
                { label: "Spazio", value: fmt(f.capSpace), tone: f.overCap ? "bad" : "gold" },
                { label: "Riserve", value: fmt(f.reserveSpace) },
              ]}
            />
            <div className="mt-4">
              <CapLine payroll={f.payroll} cap={f.effectiveCap} floor={f.floor} dark />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {f.overCap && (
          <Badge tone="bad" icon="flame">
            Budget sforato · luxury tax {fmtEuro(f.luxuryTaxEur)} €
          </Badge>
        )}
        {f.belowFloor && (
          <Badge tone="warn" icon="alert">
            Sotto il salary floor ({fmt(f.floor)})
          </Badge>
        )}
        {t.warnings.map((w) => (
          <Badge key={w} icon="clipboard">
            {w}
          </Badge>
        ))}
        <Badge tone={t.entryFeePaid ? "good" : "neutral"} icon={t.entryFeePaid ? "check" : "coins"}>
          Quota {t.entryFeePaid ? "pagata" : "da pagare"}
        </Badge>
        {standing && (
          <Link href="/classifica" className="rounded-full transition-opacity hover:opacity-80">
            <Badge tone="accent" icon="trophy">
              {standing.position}° su Dunkest · {standing.wins}–{standing.losses}
            </Badge>
          </Link>
        )}
        {injuredCount > 0 && (
          <a href={`/squadre/${id}#infermeria`} className="rounded-full transition-opacity hover:opacity-80">
            <Badge tone="bad" icon="medkit">
              {injuredCount} {injuredCount === 1 ? "infortunato" : "infortunati"}
            </Badge>
          </a>
        )}
      </div>

      <div className="mt-6">
        <ViewSwitch
          label="Sezioni della squadra"
          options={[
            { href: `/squadre/${id}`, label: "Rosa", hint: "titolari, riserve, infortuni", icon: "jersey", active: tab === "rosa" },
            { href: `/squadre/${id}?vista=dunkest`, label: "Su Dunkest", hint: "formazione, cambi, rivalità", icon: "ball", active: tab === "dunkest" },
            { href: `/squadre/${id}?vista=vetrina`, label: "Vetrina", hint: "i trofei della stagione", icon: "trophy", active: tab === "vetrina" },
            { href: `/squadre/${id}?vista=pick`, label: "Pick", hint: "pick, talenti e tagli", icon: "ticket", active: tab === "pick" },
          ]}
        />
      </div>

      {tab === "rosa" && (
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
          <div>
            <Section title="Titolari" icon="jersey" aside={`${t.starters.length}/${positions.reduce((n, p) => n + league.settings.starters[p], 0)}`}>
              <div className="mb-3 grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
                {positions.map((p) => (
                  <SlotMeter key={p} label={POS_LABEL[p]} have={t.starters.filter((x) => x.pos === p).length} need={league.settings.starters[p]} />
                ))}
              </div>
              {t.starters.length === 0 ? (
                <Empty title="Nessun titolare" icon="jersey" />
              ) : (
                <div className="space-y-4">
                  {positions.map((p, gi) => {
                    const group = t.starters.filter((x) => x.pos === p);
                    if (group.length === 0) return null;
                    return (
                      <div key={p}>
                        <h3 className="eyebrow mb-1.5 text-muted">{POS_LABEL[p]}</h3>
                        <Roster players={group} dunkest={dunkest} offset={gi * 5} />
                      </div>
                    );
                  })}
                  {unknownPos.length > 0 && (
                    <div>
                      <h3 className="eyebrow mb-1.5 text-muted">Ruolo da indicare</h3>
                      <Roster players={unknownPos} dunkest={dunkest} offset={13} />
                    </div>
                  )}
                </div>
              )}
              {board && value && (value.deal || value.flop) && (
                <div className="mt-4">
                  <TeamValue deal={value.deal} flop={value.flop} pool={board.pool} you={you} />
                  <Link href="/giocatori?vista=affari" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-brand-blue hover:underline">
                    Stipendio contro rendimento in tutta la lega
                    <Icon name="arrow-right" size={14} strokeWidth={2.2} />
                  </Link>
                </div>
              )}
            </Section>

          </div>
          <div>
            <Infirmary players={roster} dunkest={dunkest} />
            <Section title="Riserve" icon="clipboard" aside={`${t.reserves.length} (min ${league.settings.reserveMin}, max ${league.settings.reserveMax})`}>
              {t.reserves.length === 0 ? <Empty title="Nessuna riserva" icon="clipboard" /> : <Roster players={t.reserves} dunkest={dunkest} />}
            </Section>

          </div>
        </div>
      )}

      {tab === "dunkest" && (
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div>
            <DunkestLineup t={t} league={league} view={view} teams={teams} positions={trend} />
            {moves && (
              <Section title="Cambi di rosa" icon="swap" id="cambi" aside="su Dunkest">
                <RosterMovesList moves={moves} />
              </Section>
            )}
          </div>
          <div>
            {rivals.length > 0 && (
              <Section title="Rivalità" icon="swap" id="rivalita" aside="scontri diretti">
                <RivalryList teamId={id} rows={rivals} badges={rivalryBadges(rivals)} teams={teams} you={you} />
              </Section>
            )}

          </div>
        </div>
      )}

      {tab === "vetrina" && (
        <div className="mt-8">
          <Section title="Vetrina" icon="trophy" aside="premi della giornata vinti in stagione">
            {season ? (
              <TrophyCase teamId={id} season={season} teams={teams} you={you} />
            ) : (
              <Empty title="Dati non disponibili" icon="trophy">
                Calendario e formazioni di Dunkest non si leggono in questo momento.
              </Empty>
            )}
          </Section>
        </div>
      )}

      {tab === "pick" && (
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Section title="Pick" icon="ticket" aside={`${ownPicks.length} possedute`}>
              {years.length === 0 ? (
                <Empty title="Nessuna pick" icon="ticket" />
              ) : (
                <div className="space-y-3">
                  {years.map((y) => (
                    <div key={y} className="rounded-2xl border border-line bg-surface p-3">
                      <div className="font-display mb-2 text-xl leading-none font-black">Draft {y}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ownPicks
                          .filter((p) => p.year === y)
                          .sort((a, b) => a.round - b.round)
                          .map((p) => {
                            const own = p.original_team_id === id;
                            return (
                              <span
                                key={p.id}
                                title={own ? "Propria" : `Da ${name(p.original_team_id)}`}
                                className={`relative inline-flex items-center gap-1.5 rounded-lg border py-1 pr-2.5 pl-2 text-sm font-semibold ${
                                  p.to_confirm ? "border-warning/50 border-dashed bg-warning/10" : own ? "border-line bg-surface-subtle" : "border-brand-blue/40 bg-brand-blue/10"
                                }`}
                              >
                                <span className="font-display tnum text-lg leading-none font-black">{p.round}°</span>
                                {!own && (
                                  <>
                                    <TeamCrest name={name(p.original_team_id)} color={colors.get(p.original_team_id) ?? "#555"} size="xs" />
                                    <span className="max-w-24 truncate text-xs">{name(p.original_team_id)}</span>
                                  </>
                                )}
                                {p.to_confirm && <span className="text-xs font-bold text-warning">?</span>}
                              </span>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {ceded.length > 0 && (
                <div className="mt-3 rounded-2xl border border-dashed border-line p-3">
                  <div className="eyebrow mb-1.5 text-muted">Cedute</div>
                  <ul className="space-y-1 text-sm">
                    {ceded.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className="tnum font-semibold">
                          {p.year} {p.round}°
                        </span>
                        <Icon name="arrow-right" size={14} className="text-muted" />
                        <span className="truncate">{name(p.current_team_id)}</span>
                        {p.to_confirm && <span className="text-xs text-warning">(da confermare)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

          </div>
          <div>
            <Section title="Talenti" icon="crown" aside={t.talents.length}>
              {t.talents.length === 0 ? (
                <Empty title="Nessun talento" icon="crown" />
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {t.talents.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{x.display_name}</span>
                        {x.draft_year && (
                          <span className="block text-xs text-muted">
                            draft {x.draft_year}
                            {x.notes ? ` · ${x.notes}` : ""}
                          </span>
                        )}
                      </span>
                      {x.entry_credits !== null ? (
                        <span className="font-display tnum text-2xl font-black">{fmt(Number(x.entry_credits))}</span>
                      ) : (
                        <span title="Crediti non indicati" className="font-display text-2xl font-black text-muted/60">
                          <span aria-hidden>–</span>
                          <span className="sr-only">Crediti non indicati</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

          </div>
          <div>
            <Section title="Tagliati" icon="x" aside="paga 1/3 dello stipendio">
              {t.cuts.length === 0 ? (
                <Empty title="Nessun taglio" icon="check" />
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {t.cuts.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-muted line-through decoration-danger/50">{c.name}</span>
                      <span className="font-display tnum text-2xl font-black text-danger">{fmt(c.paid)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

          </div>
        </div>
      )}

      {dunkest.available && roster.map((p) => <PlayerSheet key={p.playerId} player={{ ...p, owner: { name: t.team.name, color } }} dunkest={dunkest} />)}
    </>
  );
}
