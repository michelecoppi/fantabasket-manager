import Link from "next/link";
import type { ReactNode } from "react";
import { CapPlanner } from "@/components/cap-planner";
import { ChipLinks, ViewSwitch } from "@/components/chips";
import { TeamCrest } from "@/components/crest";
import { CapOutlook, PlannerLegend, type OutlookTeam } from "@/components/plan-parts";
import { PlayerList, PlayerRow } from "@/components/player-row";
import { ContractPips, Empty, PageTitle, RestrictionBadge, Scoreboard, Section } from "@/components/ui";
import { capPlan, type PlannerTeam } from "@/lib/cap-planner";
import { endSeason, expiringContracts, parseExpiringFilters, summarizeExpiring, type ExpiringFilters } from "@/lib/expiring";
import { fmt } from "@/lib/format";
import type { LeagueView } from "@/lib/league";
import { loadLeague, loadProfile } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

type View = "list" | "planner";

/** Link con vista e filtri di squadra/stagione; i filtri vuoti restano fuori dall'URL. */
function href(f: ExpiringFilters, view: View = "list") {
  const q = new URLSearchParams();
  if (view === "planner") q.set("vista", "planner");
  if (f.teamId) q.set("squadra", f.teamId);
  if (view === "list" && f.season) q.set("stagione", String(f.season));
  const s = q.toString();
  return s ? `/scadenze?${s}` : "/scadenze";
}

export default async function ExpiringPage(props: PageProps<"/scadenze">) {
  const sp = await props.searchParams;
  const filters = parseExpiringFilters(sp);
  const view: View = sp.vista === "planner" ? "planner" : "list";
  const [league, profile] = await Promise.all([loadLeague(), loadProfile()]);
  const tabs = (
    <ViewSwitch
      label="Vista"
      options={[
        { href: href({ ...filters, season: null }, "list"), label: "Scadenze", hint: "chi scade e quando", icon: "hourglass", active: view === "list" },
        { href: href({ ...filters, season: null }, "planner"), label: "Planner del cap", hint: "spazio nelle prossime stagioni", icon: "chart", active: view === "planner" },
      ]}
    />
  );
  if (view === "planner") return <PlannerView league={league} teamId={filters.teamId} myTeamId={profile?.team_id ?? null} tabs={tabs} />;

  const maxYears = Math.max(1, ...league.teams.flatMap((t) => [...t.starters, ...t.reserves].map((p) => p.yearsLeft ?? 0)));
  const noYears = league.teams.reduce((n, t) => n + [...t.starters, ...t.reserves].filter((p) => p.yearsLeft === null).length, 0);
  const seasons = Array.from({ length: endSeason(league.seasonYear, maxYears) - league.seasonYear + 1 }, (_, i) => league.seasonYear + i);
  const rows = expiringContracts(league.teams, league.seasonYear, filters);
  const groups = seasons
    .map((y) => {
      const groupRows = rows.filter((r) => r.endSeason === y);
      return { year: y, rows: groupRows, summary: summarizeExpiring(groupRows) };
    })
    .filter((g) => g.rows.length > 0);
  const thisYear = groups.find((g) => g.year === league.seasonYear);
  const colors = teamColors(league.teams.map((t) => t.team.id));

  return (
    <>
      <PageTitle
        icon="hourglass"
        eyebrow="Mercato e asta"
        sub="Contratti di titolari e riserve per stagione di scadenza: utile a pianificare l'asta. Con team option (+1) la scadenza può slittare di una stagione."
        aside={
          <Scoreboard
            items={[
              { label: "In elenco", value: rows.length },
              { label: `Scadono ${league.seasonYear}`, value: thisYear?.rows.length ?? 0, tone: "gold" },
              { label: "Senza durata", value: noYears },
            ]}
          />
        }
      >
        Contratti in scadenza
      </PageTitle>

      <div className="mb-4">{tabs}</div>

      <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
        <ChipLinks
          label="Squadra"
          options={[
            { href: href({ ...filters, teamId: "" }), label: "Tutte", active: !filters.teamId },
            ...league.teams.map((t) => ({ href: href({ ...filters, teamId: t.team.id }), label: t.team.name, active: filters.teamId === t.team.id })),
          ]}
        />
        <ChipLinks
          label="Stagione"
          options={[
            { href: href({ ...filters, season: null }), label: "Tutte", active: !filters.season },
            ...seasons.map((y) => ({ href: href({ ...filters, season: y }), label: `Scade nel ${y}`, active: filters.season === y })),
          ]}
        />
      </div>

      {noYears > 0 && <p className="mt-4 text-sm text-muted">{noYears} contratti senza durata (da fissare) non sono in elenco.</p>}
      {groups.length === 0 && (
        <div className="mt-6">
          <Empty title="Nessun contratto" icon="hourglass">
            Nessun contratto con questi filtri.{" "}
            <Link href="/scadenze" className="font-semibold text-brand-blue underline underline-offset-4">
              Azzera i filtri
            </Link>
          </Empty>
        </div>
      )}

      <ol className="relative mt-8 space-y-10 before:absolute before:top-2 before:bottom-2 before:left-[0.6875rem] before:w-0.5 before:bg-linear-to-b before:from-gold before:via-line before:to-transparent lg:before:left-[0.6875rem]">
        {groups.map((g) => {
          const current = g.year === league.seasonYear;
          return (
            <li key={g.year} className="relative grid gap-4 pl-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
              <span
                aria-hidden
                className={`absolute top-1.5 left-0 grid h-6 w-6 place-items-center rounded-full border-2 ${current ? "border-gold bg-gold shadow-[0_0_14px_var(--gold)]" : "border-line bg-surface"}`}
              >
                <span className={`h-2 w-2 rounded-full ${current ? "bg-nav" : "bg-muted"}`} />
              </span>
              <div className="lg:sticky lg:top-24 lg:self-start">
                <p className="eyebrow text-muted">{current ? "Stagione corrente" : "Scadono a fine"}</p>
                <h2 className="font-display tnum text-6xl leading-[0.85] font-black">{g.year}</h2>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center lg:grid-cols-1 lg:text-left">
                  <div className="rounded-xl bg-surface-subtle px-3 py-2">
                    <dt className="eyebrow text-muted">Contratti</dt>
                    <dd className="font-display tnum text-2xl leading-none font-black">{g.rows.length}</dd>
                  </div>
                  <div className="rounded-xl bg-surface-subtle px-3 py-2">
                    <dt className="eyebrow text-muted">Crediti</dt>
                    <dd className="font-display tnum text-2xl leading-none font-black">{fmt(g.summary.salary)}</dd>
                  </div>
                  <div className="rounded-xl bg-surface-subtle px-3 py-2">
                    <dt className="eyebrow text-muted">Option</dt>
                    <dd className="font-display tnum text-2xl leading-none font-black">{g.summary.options}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted">
                  {g.summary.starters} titolari · {g.summary.reserves} riserve
                </p>
              </div>
              <PlayerList>
                {g.rows.map((r, i) => (
                  <PlayerRow
                    key={`${r.teamId}-${r.player.id}`}
                    i={i}
                    pos={r.player.pos}
                    name={r.player.name}
                    meta={
                      <Link href={`/squadre/${r.teamId}`} className="inline-flex min-w-0 items-center gap-1.5 hover:underline">
                        {/* lo stemma fa riconoscere la squadra senza leggere: l'elenco mescola tutte le rose */}
                        <TeamCrest name={r.teamName} color={colors.get(r.teamId) ?? "#555"} size="xs" className="-my-1" />
                        <span className="min-w-0">
                          {r.teamName} · {r.player.slot === "reserve" ? "riserva" : "titolare"}
                          {r.optionSeason ? ` · option fino al ${r.optionSeason}` : ""}
                        </span>
                      </Link>
                    }
                    badges={(r.player.rookie || r.player.restriction) && <RestrictionBadge rookie={r.player.rookie} restriction={r.player.restriction} />}
                    contract={<ContractPips years={r.player.yearsLeft} option={r.player.teamOption} label={r.player.contractLabel} />}
                    value={r.player.salary}
                  />
                ))}
              </PlayerList>
            </li>
          );
        })}
      </ol>
    </>
  );
}

const plannerTeam = (t: LeagueView["teams"][number]): PlannerTeam => ({ starters: t.starters, reserves: t.reserves, cuts: t.cuts, bonus: t.bonus });

/** Vista "Planner del cap" (issue #46): panoramica della lega senza squadra, planner interattivo con una squadra scelta. */
function PlannerView({ league, teamId, myTeamId, tabs }: { league: LeagueView; teamId: string; myTeamId: string | null; tabs: ReactNode }) {
  const s = league.settings;
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const selected = league.teams.find((t) => t.team.id === teamId) ?? null;
  const startersNeeded = s.starters.G + s.starters.A + s.starters.C;
  const next = league.seasonYear + 1;
  const all = league.teams.flatMap((t) => [...t.starters, ...t.reserves]);
  const openOptions = all.filter((p) => p.teamOption && p.yearsLeft !== null).length;
  const noYears = all.filter((p) => p.yearsLeft === null).length;
  const pendingCuts = league.teams.reduce((n, t) => n + t.cuts.filter((c) => c.status === "pending").length, 0);
  const teamChips = (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <ChipLinks
        label="Squadra"
        options={[
          { href: href({ teamId: "", season: null }, "planner"), label: "Tutta la lega", active: !selected },
          ...[...league.teams]
            .sort((a, b) => Number(b.team.id === myTeamId) - Number(a.team.id === myTeamId))
            .map((t) => ({
              href: href({ teamId: t.team.id, season: null }, "planner"),
              label: t.team.id === myTeamId ? `${t.team.name} · tu` : t.team.name,
              active: selected?.team.id === t.team.id,
            })),
        ]}
      />
    </div>
  );

  if (!selected) {
    const years = Array.from({ length: s.contractMaxYears }, (_, i) => league.seasonYear + i);
    const teams: OutlookTeam[] = league.teams.map((t) => {
      const base = capPlan(plannerTeam(t), league.seasonYear, s);
      return {
        id: t.team.id,
        name: t.team.name,
        color: colors.get(t.team.id) ?? "#1d47b5",
        mine: t.team.id === myTeamId,
        seasons: base.seasons,
        withOptions: capPlan(plannerTeam(t), league.seasonYear, s, { exercised: base.optionIds, pendingCutsTaken: false, rank: null }).seasons,
        href: href({ teamId: t.team.id, season: null }, "planner"),
      };
    });
    const mine = teams.find((t) => t.mine);
    return (
      <>
        <PageTitle
          icon="chart"
          eyebrow="Mercato e asta"
          sub="Quanto spazio resta a ogni squadra nelle prossime stagioni con i contratti di oggi. Scegli una squadra per provare le ipotesi: team option, tagli in asta e piazzamento in classifica."
          aside={
            <Scoreboard
              items={[
                { label: "Option da decidere", value: openOptions, tone: "gold" },
                { label: "Durate da fissare", value: noYears },
                { label: "Tagli in asta", value: pendingCuts },
              ]}
            />
          }
        >
          Planner del cap
        </PageTitle>
        <div className="mb-4">{tabs}</div>
        {teamChips}
        <div className="mt-10">
          <Section title={`Spazio ${league.seasonYear}–${years[years.length - 1]}`} icon="chart" id="panoramica" aside="scenario neutro">
            <CapOutlook teams={teams} years={years} startersNeeded={startersNeeded} />
            <p className="mt-3 text-xs text-muted">
              In blu quanto costerebbero in più le team option, se esercitate tutte. Scegli una squadra per il planner completo
              {mine && (
                <>
                  {" "}o apri subito{" "}
                  <Link href={mine.href} className="font-semibold text-brand-blue underline underline-offset-4">
                    {mine.name}
                  </Link>
                </>
              )}
              .
            </p>
          </Section>
        </div>
        <PlannerLegend />
      </>
    );
  }

  const team = plannerTeam(selected);
  const base = capPlan(team, league.seasonYear, s);
  const nextSeason = base.seasons[1];
  const mine = selected.team.id === myTeamId;
  return (
    <>
      <PageTitle
        icon="chart"
        eyebrow="Planner del cap"
        sub={`Impegni di ${selected.team.name} stagione per stagione. Le stagioni future partono dal cap base e cambiano solo con le ipotesi che scegli qui: nulla viene salvato.`}
        aside={
          <Scoreboard
            items={[
              { label: `Spazio ${next}`, value: fmt(nextSeason.space), tone: nextSeason.space < 0 ? "bad" : "gold" },
              { label: `Titolari ${next}`, value: `${nextSeason.starterCount}/${startersNeeded}` },
              { label: "Option", value: base.optionIds.length },
            ]}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-3 sm:gap-4">
          <TeamCrest name={selected.team.name} color={colors.get(selected.team.id) ?? "#1d47b5"} size="lg" mine={mine} morphId={selected.team.id} />
          <span className="min-w-0 truncate">{selected.team.name}</span>
        </span>
      </PageTitle>
      <div className="mb-4">{tabs}</div>
      {teamChips}
      <div className="mt-6">
        <CapPlanner key={selected.team.id} team={team} seasonYear={league.seasonYear} settings={s} />
      </div>
      <p className="mt-8 text-sm text-muted">
        <Link href={`/squadre/${selected.team.id}`} className="font-semibold text-brand-blue underline underline-offset-4">
          Rosa di {selected.team.name}
        </Link>
        {" · "}
        <Link href={href({ teamId: selected.team.id, season: null })} className="font-semibold text-brand-blue underline underline-offset-4">
          Scadenze della squadra
        </Link>
      </p>
    </>
  );
}
