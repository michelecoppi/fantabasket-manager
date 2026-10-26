import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { Badge, PageTitle, Scoreboard, Section, stagger } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

const ROUNDS = [1, 2, 3, 4, 5];

export default async function DraftPage() {
  const league = await loadLeague();
  const years = [...new Set(league.picks.map((p) => p.year))].sort();
  const name = (id: string | null) => (id ? league.teamNames.get(id) ?? "?" : "da definire");
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const color = (id: string | null) => (id ? colors.get(id) ?? "#555" : "#555");
  const hasPending = league.picks.some((p) => p.to_confirm);
  const traded = league.picks.filter((p) => p.current_team_id !== p.original_team_id).length;
  // L'ordine del draft si registra alla chiusura: il proprietario di adesso si legge dalle pick, così gli scambi successivi si vedono.
  const slot = (r: (typeof league.rookieDraft)[number]) => {
    if (!r.original_team_id) return { teamId: r.team_id, note: r.note };
    const round = Math.ceil(r.pick_no / league.teams.length);
    const pick = league.picks.find((p) => p.year === league.seasonYear && p.round === round && p.original_team_id === r.original_team_id);
    const teamId = pick?.current_team_id ?? r.team_id;
    return { teamId, note: teamId === r.original_team_id ? "" : `Da ${name(r.original_team_id)}` };
  };
  const perRound = Math.max(1, league.teams.length);
  const draftRounds = [...new Set(league.rookieDraft.map((r) => Math.ceil(r.pick_no / perRound)))];

  return (
    <>
      <PageTitle
        icon="ticket"
        eyebrow="Pick e rookie draft"
        sub={
          <>
            5 giri, una scelta per squadra e per giro. Si scambiano solo le scelte dei prossimi 3 anni. Nella griglia il pallino grigio è una scelta ancora della
            squadra; lo stemma indica il proprietario attuale.{hasPending && " Il ? segna le scelte da confermare."}
          </>
        }
        aside={
          <Scoreboard
            items={[
              { label: "Pick", value: league.picks.length },
              { label: "Scambiate", value: traded, tone: "gold" },
              { label: "Da confermare", value: league.picks.filter((p) => p.to_confirm).length },
            ]}
          />
        }
      >
        Draft
      </PageTitle>

      {years.map((y) => {
        const picks = league.picks.filter((p) => p.year === y);
        const moved = picks.filter((p) => p.current_team_id !== p.original_team_id).length;
        return (
          <Section key={y} title={`Draft ${y}`} icon="ticket" aside={`${moved} scelte scambiate`}>
            <div role="region" aria-label={`Pick del draft ${y} per squadra, scorri in orizzontale`} tabIndex={0} className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <caption className="sr-only">Chi possiede ora ogni pick del draft {y}, per squadra di origine e giro</caption>
                <thead>
                  <tr className="eyebrow border-b border-line bg-surface-subtle/60 text-left text-muted">
                    <th scope="col" className="sticky left-0 z-[1] bg-surface-subtle px-4 py-2 font-bold">Pick di</th>
                    {ROUNDS.map((r) => (
                      <th key={r} scope="col" className="px-2 py-2 text-center font-bold">
                        {r}° giro
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {league.teams.map(({ team }, ti) => (
                    <tr key={team.id} className="rise" style={stagger(ti)}>
                      <th scope="row" className="sticky left-0 z-[1] border-r border-line bg-surface px-4 py-2 text-left font-semibold whitespace-nowrap">
                        <Link href={`/squadre/${team.id}`} className="flex min-h-11 max-w-[11rem] items-center gap-2 hover:underline">
                          <TeamCrest name={team.name} color={color(team.id)} size="xs" />
                          <span className="truncate">{team.name}</span>
                        </Link>
                      </th>
                      {ROUNDS.map((r) => {
                        const p = picks.find((x) => x.original_team_id === team.id && x.round === r);
                        return (
                          <td key={r} className="px-2 py-1.5 text-center">
                            {!p ? (
                              <span className="text-muted">–</span>
                            ) : p.current_team_id === team.id ? (
                              <>
                                <span className="mx-auto block h-2 w-2 rounded-full bg-foreground/15" aria-hidden />
                                <span className="sr-only">Ancora della squadra</span>
                              </>
                            ) : p.current_team_id ? (
                              <Link
                                href={`/squadre/${p.current_team_id}`}
                                className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border py-1 pr-2 pl-1 text-xs font-bold transition-[filter] hover:brightness-95"
                                style={{ borderColor: `color-mix(in oklab, ${color(p.current_team_id)} 45%, transparent)`, background: `color-mix(in oklab, ${color(p.current_team_id)} 12%, transparent)` }}
                              >
                                <TeamCrest name={name(p.current_team_id)} color={color(p.current_team_id)} size="xs" />
                                <span className="truncate">{name(p.current_team_id)}</span>
                                {p.to_confirm && (
                                  <span className="text-warning">
                                    <span aria-hidden>?</span>
                                    <span className="sr-only">Destinatario da confermare</span>
                                  </span>
                                )}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-muted italic">
                                da definire {p.to_confirm && <Badge tone="warn" title="Destinatario da confermare">?</Badge>}
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
        <Section title={`Ordine del draft ${league.seasonYear}`} icon="trophy" aside={`${league.rookieDraft.length} scelte`}>
          <div className="space-y-6">
            {draftRounds.map((round) => (
              <div key={round}>
                <h3 className="eyebrow mb-2 text-muted">{round}° giro</h3>
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                  {league.rookieDraft
                    .filter((r) => Math.ceil(r.pick_no / perRound) === round)
                    .map((r, i) => {
                      const { teamId, note } = slot(r);
                      return (
                        <li key={r.pick_no} className="pop" style={stagger(i)}>
                          <Link
                            href={`/squadre/${teamId}`}
                            className="lift group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface p-3 hover:border-foreground/25"
                          >
                            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color(teamId) }} />
                            <span className="flex items-start justify-between gap-2">
                              <span className="font-display tnum text-4xl leading-none font-black">{r.pick_no}</span>
                              <TeamCrest name={name(teamId)} color={color(teamId)} size="sm" />
                            </span>
                            <span className="mt-2 truncate text-sm font-semibold group-hover:underline">{name(teamId)}</span>
                            {note && <span className="truncate text-xs text-muted">{note}</span>}
                          </Link>
                        </li>
                      );
                    })}
                </ol>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
