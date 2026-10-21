import Link from "next/link";
import { Badge, PageTitle, Section } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";

const ROUNDS = [1, 2, 3, 4, 5];

export default async function DraftPage() {
  const league = await loadLeague();
  const years = [...new Set(league.picks.map((p) => p.year))].sort();
  const name = (id: string | null) => (id ? league.teamNames.get(id) ?? "?" : "da definire");
  const hasPending = league.picks.some((p) => p.to_confirm);

  return (
    <>
      <PageTitle sub={<>5 giri, una scelta per squadra e per giro. Si scambiano solo le scelte dei prossimi 3 anni.
        Il punto (·) indica una scelta ancora della squadra, il nome il proprietario attuale.{hasPending && " Il ? segna le scelte da confermare."}</>}>Draft</PageTitle>

      {years.map((y) => {
        const picks = league.picks.filter((p) => p.year === y);
        const moved = picks.filter((p) => p.current_team_id !== p.original_team_id).length;
        return (
          <Section key={y} title={`Draft ${y}`} aside={`${moved} scelte scambiate`}>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                    <th className="px-3 py-2 font-medium">Pick di</th>
                    {ROUNDS.map((r) => <th key={r} className="px-2 py-2 font-medium">{r}° giro</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {league.teams.map(({ team }) => (
                    <tr key={team.id}>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        <Link href={`/squadre/${team.id}`} className="hover:underline">{team.name}</Link>
                      </th>
                      {ROUNDS.map((r) => {
                        const p = picks.find((x) => x.original_team_id === team.id && x.round === r);
                        return (
                          <td key={r} className="px-2 py-2">
                            {!p ? <span className="text-muted">–</span> : p.current_team_id === team.id ? (
                              <span className="text-muted" title="Ancora della squadra">·</span>
                            ) : (
                              <span className="flex items-center gap-1">
                                {p.current_team_id ? (
                                  <Link href={`/squadre/${p.current_team_id}`} className="font-medium text-brand-blue hover:underline">{name(p.current_team_id)}</Link>
                                ) : (
                                  <span className="italic text-muted">da definire</span>
                                )}
                                {p.to_confirm && <Badge tone="warn" title="Destinatario da confermare">?</Badge>}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
