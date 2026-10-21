import Link from "next/link";
import { Badge, PageTitle, Section } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";

export default async function DraftPage() {
  const league = await loadLeague();
  const years = [...new Set(league.picks.map((p) => p.year))].sort();
  const name = (id: string | null) => (id ? league.teamNames.get(id) ?? "?" : "da definire");
  const hasPending = league.picks.some((p) => p.to_confirm);

  return (
    <>
      <PageTitle sub={<>5 giri, una scelta per squadra e per giro. Si scambiano solo le scelte dei prossimi 3 anni.
        {hasPending && " Le caselle evidenziate sono da confermare."}</>}>Draft</PageTitle>

      {years.map((y) => {
        const rows = [1, 2, 3, 4, 5].map((round) => league.picks.filter((p) => p.year === y && p.round === round));
        const moved = rows.flat().filter((p) => p.current_team_id !== p.original_team_id);
        return (
          <Section key={y} title={`Draft ${y}`} aside={`${moved.length} scelte scambiate`}>
            {moved.length === 0 ? (
              <p className="text-sm text-muted">Nessuno scambio: ogni squadra ha le proprie scelte.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {moved.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="w-8 text-sm text-muted">{p.round}°</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/squadre/${p.original_team_id}`} className="hover:underline">{name(p.original_team_id)}</Link>
                      <span className="mx-2 text-muted">→</span>
                      {p.current_team_id ? (
                        <Link href={`/squadre/${p.current_team_id}`} className="font-medium hover:underline">{name(p.current_team_id)}</Link>
                      ) : (
                        <span className="italic text-muted">destinatario da definire</span>
                      )}
                    </span>
                    {p.to_confirm && <Badge tone="warn">da confermare</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      {league.rookieDraft.length > 0 && (
        <Section title="Ordine del draft 2026" aside={`${league.rookieDraft.length} scelte`}>
          <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {league.rookieDraft.map((r) => (
              <li key={r.pick_no} className="flex items-center gap-3 px-3 py-2">
                <span className="w-8 text-sm tabular-nums text-muted">{r.pick_no}</span>
                <Link href={`/squadre/${r.team_id}`} className="w-40 shrink-0 truncate font-medium hover:underline">{name(r.team_id)}</Link>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{r.note}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}
