import Link from "next/link";
import { Badge, Section } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";

export default async function DraftPage() {
  const league = await loadLeague();
  const years = [...new Set(league.picks.map((p) => p.year))].sort();
  const name = (id: string | null) => (id ? league.teamNames.get(id) ?? "?" : "da definire");
  const hasPending = league.picks.some((p) => p.to_confirm);

  return (
    <>
      <h1 className="text-2xl font-bold">Draft</h1>
      <p className="mt-1 text-sm text-neutral-500">
        5 giri, una scelta per squadra e per giro. Si scambiano solo le scelte dei prossimi 3 anni.
        {hasPending && " Le caselle evidenziate sono da confermare."}
      </p>

      {years.map((y) => {
        const rows = [1, 2, 3, 4, 5].map((round) => league.picks.filter((p) => p.year === y && p.round === round));
        const moved = rows.flat().filter((p) => p.current_team_id !== p.original_team_id);
        return (
          <Section key={y} title={`Draft ${y}`} aside={`${moved.length} scelte scambiate`}>
            {moved.length === 0 ? (
              <p className="text-sm text-neutral-500">Nessuno scambio: ogni squadra ha le proprie scelte.</p>
            ) : (
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {moved.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="w-8 text-sm text-neutral-500">{p.round}°</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/squadre/${p.original_team_id}`} className="hover:underline">{name(p.original_team_id)}</Link>
                      <span className="mx-2 text-neutral-400">→</span>
                      {p.current_team_id ? (
                        <Link href={`/squadre/${p.current_team_id}`} className="font-medium hover:underline">{name(p.current_team_id)}</Link>
                      ) : (
                        <span className="italic text-neutral-500">destinatario da definire</span>
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
          <ol className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {league.rookieDraft.map((r) => (
              <li key={r.pick_no} className="flex items-center gap-3 px-3 py-2">
                <span className="w-8 text-sm tabular-nums text-neutral-500">{r.pick_no}</span>
                <Link href={`/squadre/${r.team_id}`} className="w-40 shrink-0 truncate font-medium hover:underline">{name(r.team_id)}</Link>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-400">{r.note}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}
