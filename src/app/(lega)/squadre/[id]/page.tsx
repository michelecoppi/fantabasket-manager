import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageTitle, RestrictionBadge, Section, Stat } from "@/components/ui";
import { fmt, POS_LABEL } from "@/lib/format";
import type { RosterPlayer } from "@/lib/league";
import { loadLeague } from "@/lib/league-server";

function RosterTable({ players }: { players: RosterPlayer[] }) {
  if (players.length === 0) return <p className="text-sm text-muted">Nessun giocatore.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {players.map((p) => (
        <li key={p.id} className="flex items-center gap-3 px-3 py-2">
          <span className="w-5 text-center text-xs font-semibold text-muted">{p.pos ?? "?"}</span>
          <span className="min-w-0 flex-1 truncate">
            {p.name}
            {p.nbaTeam && <span className="ml-2 text-xs text-muted">{p.nbaTeam}</span>}
          </span>
          <RestrictionBadge value={p.restriction} />
          <span className="w-10 text-right text-sm text-muted" title="Anni di contratto (+1 = team option)">{p.contractLabel}</span>
          <span className="w-12 text-right font-medium tabular-nums">{fmt(p.salary)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function TeamPage(props: PageProps<"/squadre/[id]">) {
  const { id } = await props.params;
  const league = await loadLeague();
  const t = league.teams.find((x) => x.team.id === id);
  if (!t) notFound();
  const f = t.finance;
  const startersTotal = Object.values(league.settings.starters).reduce((a, b) => a + b, 0);
  const name =(teamId: string | null) => (teamId ? league.teamNames.get(teamId) ?? "?" : "da definire");

  const ownPicks = league.picks.filter((p) => p.current_team_id === id);
  const ceded = league.picks.filter((p) => p.original_team_id === id && p.current_team_id !== id);
  const years = [...new Set(ownPicks.map((p) => p.year))];

  return (
    <>
      <Link href="/" className="text-sm font-semibold text-brand-blue hover:underline">← Lega</Link>
      <div className="mt-2"><PageTitle sub={<>{t.team.owner_name}
        {t.finalRank && ` · ${t.finalRank}° nella scorsa stagione`}</>}>{t.team.name}</PageTitle></div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-4">
        <Stat label="Monte ingaggi" value={fmt(f.payroll)} />
        <Stat label={`Cap (${fmt(league.settings.cap)} ${t.bonus >= 0 ? "+" : "−"} ${Math.abs(t.bonus)})`} value={fmt(f.effectiveCap)} />
        <Stat label="Spazio salariale" value={fmt(f.capSpace)} tone={f.overCap ? "bad" : undefined} />
        <Stat label="Spazio riserve" value={fmt(f.reserveSpace)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {f.overCap && <Badge tone="bad">budget sforato · luxury tax {fmt(f.luxuryTaxEur)} €</Badge>}
        {f.belowFloor && <Badge tone="warn">sotto il salary floor ({fmt(f.floor)})</Badge>}
        {t.warnings.map((w) => <Badge key={w}>{w}</Badge>)}
        <Badge tone={t.entryFeePaid ? "good" : "neutral"}>quota {t.entryFeePaid ? "pagata" : "da pagare"}</Badge>
      </div>

      <Section title="Titolari" aside={`${t.starters.length}/${startersTotal}`}>
        <RosterTable players={t.starters} />
        <p className="mt-1 text-xs text-muted">
          {(["G", "A", "C"] as const).map((p) => `${POS_LABEL[p]}: ${t.starters.filter((x) => x.pos === p).length}/${league.settings.starters[p]}`).join(" · ")}
        </p>
      </Section>

      <Section title="Riserve" aside={`${t.reserves.length} (min ${league.settings.reserveMin}, max ${league.settings.reserveMax})`}>
        <RosterTable players={t.reserves} />
      </Section>

      <Section title="Squadra talenti" aside={t.talents.length}>
        {t.talents.length === 0 ? (
          <p className="text-sm text-muted">Nessun talento.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {t.talents.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{x.display_name}</span>
                {x.draft_year && <span className="text-xs text-muted">draft {x.draft_year}{x.notes ? ` · ${x.notes}` : ""}</span>}
                {x.entry_credits !== null && <span className="w-12 text-right tabular-nums">{fmt(Number(x.entry_credits))}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Giocatori tagliati" aside="paga 1/3 dello stipendio">
        {t.cuts.length === 0 ? (
          <p className="text-sm text-muted">Nessun taglio.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {t.cuts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="w-12 text-right tabular-nums">{fmt(c.paid)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Scelte al draft" aside={`${ownPicks.length} possedute`}>
        <div className="space-y-2">
          {years.map((y) => (
            <div key={y} className="flex flex-wrap items-center gap-1.5">
              <span className="w-12 text-sm font-medium">{y}</span>
              {ownPicks.filter((p) => p.year === y).map((p) => (
                <Badge key={p.id} tone={p.to_confirm ? "warn" : p.original_team_id === id ? "neutral" : "accent"} title={p.original_team_id === id ? "Propria" : `Da ${name(p.original_team_id)}`}>
                  {p.round}°{p.original_team_id !== id ? ` da ${name(p.original_team_id)}` : ""}{p.to_confirm ? " ?" : ""}
                </Badge>
              ))}
            </div>
          ))}
        </div>
        {ceded.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Cedute: {ceded.map((p) => `${p.year} ${p.round}° → ${name(p.current_team_id)}${p.to_confirm ? " (da confermare)" : ""}`).join(" · ")}
          </p>
        )}
      </Section>
    </>
  );
}
