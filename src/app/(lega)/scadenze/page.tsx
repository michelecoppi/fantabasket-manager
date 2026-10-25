import Form from "next/form";
import Link from "next/link";
import { SubmitButton } from "@/components/controls";
import { Card, PageTitle, RestrictionBadge, Section } from "@/components/ui";
import { endSeason, expiringContracts, parseExpiringFilters, summarizeExpiring } from "@/lib/expiring";
import { fmt } from "@/lib/format";
import { loadLeague } from "@/lib/league-server";

const control = "w-full rounded border border-line bg-surface px-3 py-2 text-base";

export default async function ExpiringPage(props: PageProps<"/scadenze">) {
  const filters = parseExpiringFilters(await props.searchParams);
  const league = await loadLeague();
  const maxYears = Math.max(1, ...league.teams.flatMap((t) => [...t.starters, ...t.reserves].map((p) => p.yearsLeft ?? 0)));
  const noYears = league.teams.reduce((n, t) => n + [...t.starters, ...t.reserves].filter((p) => p.yearsLeft === null).length, 0);
  const seasons = Array.from({ length: endSeason(league.seasonYear, maxYears) - league.seasonYear + 1 }, (_, i) => league.seasonYear + i);
  const rows = expiringContracts(league.teams, league.seasonYear, filters);
  const groups = seasons.map((y) => {
    const groupRows = rows.filter((r) => r.endSeason === y);
    return { year: y, rows: groupRows, summary: summarizeExpiring(groupRows) };
  }).filter((g) => g.rows.length > 0);

  return (
    <>
      <PageTitle sub="Contratti di titolari e riserve per stagione di scadenza: utile a pianificare l'asta. Con team option (+1) la scadenza può slittare di una stagione.">
        Contratti in scadenza
      </PageTitle>

      <Card className="p-3">
        <Form className="grid grid-cols-2 gap-2 sm:grid-cols-4" action="/scadenze">
          <select name="squadra" defaultValue={filters.teamId} className={control} aria-label="Squadra">
            <option value="">Tutte le squadre</option>
            {league.teams.map((t) => <option key={t.team.id} value={t.team.id}>{t.team.name}</option>)}
          </select>
          <select name="stagione" defaultValue={filters.season ?? ""} className={control} aria-label="Stagione di scadenza">
            <option value="">Tutte le stagioni</option>
            {seasons.map((y) => <option key={y} value={y}>Scade nel {y}</option>)}
          </select>
          <SubmitButton>Filtra</SubmitButton>
          <Link href="/scadenze" className="font-display rounded border border-line px-3 py-2 text-center text-lg font-bold">Azzera</Link>
        </Form>
      </Card>

      {noYears > 0 && <p className="mt-4 text-sm text-muted">{noYears} contratti senza durata (da fissare) non sono in elenco.</p>}
      {groups.length === 0 && <p className="mt-6 text-sm text-muted">Nessun contratto con questi filtri.</p>}
      {groups.map((g) => (
        <Section key={g.year} title={g.year === league.seasonYear ? `Scadono a fine ${g.year} (stagione corrente)` : `Scadono a fine ${g.year}`} aside={`${g.rows.length} contratti · ${fmt(g.summary.salary)} crediti`}>
          <p className="mb-2 text-xs text-muted">
            {g.summary.starters} titolari · {g.summary.reserves} riserve · {g.summary.options} team option
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {g.rows.map((r) => (
              <li key={`${r.teamId}-${r.player.id}`} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 text-center text-xs font-semibold text-muted">{r.player.pos ?? "?"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.player.name}</span>
                  <Link href={`/squadre/${r.teamId}`} className="text-xs text-muted hover:underline">
                    {r.teamName} · {r.player.slot === "reserve" ? "riserva" : "titolare"}
                  </Link>
                </span>
                <RestrictionBadge rookie={r.player.rookie} restriction={r.player.restriction} />
                <span className="w-10 text-right text-sm text-muted" title={r.optionSeason ? `Team option fino al ${r.optionSeason}` : undefined}>
                  {r.player.contractLabel}
                </span>
                <span className="w-12 text-right font-medium tabular-nums">{fmt(r.player.salary)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}
