import Form from "next/form";
import Link from "next/link";
import { SubmitButton } from "@/components/controls";
import { Badge, PageTitle, Stat } from "@/components/ui";
import { fmt } from "@/lib/format";
import { loadLeague, loadProfile } from "@/lib/league-server";
import { listTeams, parseTeamListOptions } from "@/lib/teams-list";

const control = "rounded border border-line bg-surface px-3 py-2 text-base";

export default async function Home(props: PageProps<"/">) {
  const options = parseTeamListOptions(await props.searchParams);
  const [league, profile] = await Promise.all([loadLeague(), loadProfile()]);
  const { settings } = league;
  const teams = listTeams(league.teams, options);

  return (
    <>
      <PageTitle sub={<>Cap {fmt(settings.cap)} (più bonus campionato) · floor {fmt(settings.cap - settings.cap / settings.floorDivisor)} · budget riserve {fmt(settings.reserveBudget)}</>}>Lega {league.seasonYear}</PageTitle>

      <Form action="/" className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <select name="ordina" defaultValue={options.sort} className={control} aria-label="Ordina per">
          <option value="nome">Per nome</option>
          <option value="monte">Per monte ingaggi</option>
          <option value="spazio">Per spazio salariale</option>
        </select>
        <select name="mostra" defaultValue={options.filter} className={control} aria-label="Mostra">
          <option value="tutte">Tutte le squadre</option>
          <option value="sforate">Solo sforate</option>
          <option value="floor">Solo sotto floor</option>
          <option value="incomplete">Solo rose incomplete</option>
        </select>
        <SubmitButton>Applica</SubmitButton>
        <Link href="/" className="font-display rounded border border-line px-4 py-2 text-center text-lg font-bold">Azzera</Link>
      </Form>

      {teams.length === 0 && <p className="text-sm text-muted">Nessuna squadra con questo filtro.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => {
          const f = t.finance;
          const mine = profile?.team_id === t.team.id;
          return (
            <Link
              key={t.team.id}
              href={`/squadre/${t.team.id}`}
              className={`rounded-lg border border-t-4 bg-surface p-4 transition hover:border-brand-blue ${
                mine ? "border-brand-red" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-2xl leading-none font-bold">{t.team.name}</div>
                  <div className="text-sm text-muted">{t.team.owner_name}</div>
                </div>
                {mine && <Badge tone="accent">La tua</Badge>}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Monte ingaggi" value={fmt(f.payroll)} />
                <Stat label="Spazio" value={fmt(f.capSpace)} tone={f.overCap ? "bad" : undefined} />
                <Stat label="Spazio riserve" value={fmt(f.reserveSpace)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={t.bonus > 0 ? "good" : t.bonus < 0 ? "warn" : "neutral"} title="Bonus/malus campionato">
                  bonus {t.bonus > 0 ? "+" : ""}{t.bonus}
                </Badge>
                {f.overCap && <Badge tone="bad">budget sforato</Badge>}
                {f.belowFloor && <Badge tone="warn" title={`Sotto il salary floor (${fmt(f.floor)})`}>sotto floor</Badge>}
                {t.warnings.length > 0 && <Badge title={t.warnings.join(" · ")}>rosa incompleta</Badge>}
                <Badge tone={t.entryFeePaid ? "good" : "neutral"}>quota {t.entryFeePaid ? "pagata" : "da pagare"}</Badge>
                {f.luxuryTaxEur > 0 && <Badge tone={t.luxuryTaxPaid ? "good" : "bad"} title="Luxury tax (R-12)">luxury tax {fmt(f.luxuryTaxEur)} € {t.luxuryTaxPaid ? "pagata" : "da pagare"}</Badge>}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
