import Link from "next/link";
import { ChipLinks } from "@/components/chips";
import { PlayerList, PlayerRow } from "@/components/player-row";
import { ContractPips, Empty, PageTitle, RestrictionBadge, Scoreboard } from "@/components/ui";
import { endSeason, expiringContracts, parseExpiringFilters, summarizeExpiring, type ExpiringFilters } from "@/lib/expiring";
import { fmt } from "@/lib/format";
import { loadLeague } from "@/lib/league-server";

/** Link con i filtri di squadra/stagione; i filtri vuoti restano fuori dall'URL. */
function href(f: ExpiringFilters) {
  const q = new URLSearchParams();
  if (f.teamId) q.set("squadra", f.teamId);
  if (f.season) q.set("stagione", String(f.season));
  const s = q.toString();
  return s ? `/scadenze?${s}` : "/scadenze";
}

export default async function ExpiringPage(props: PageProps<"/scadenze">) {
  const filters = parseExpiringFilters(await props.searchParams);
  const league = await loadLeague();
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
                      <Link href={`/squadre/${r.teamId}`} className="hover:underline">
                        {r.teamName} · {r.player.slot === "reserve" ? "riserva" : "titolare"}
                        {r.optionSeason ? ` · option fino al ${r.optionSeason}` : ""}
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
