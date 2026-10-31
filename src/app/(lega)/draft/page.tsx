import Link from "next/link";
import type { ReactNode } from "react";
import { TeamCrest } from "@/components/crest";
import { Icon, type IconName } from "@/components/icons";
import { Badge, PageTitle, Scoreboard, stagger } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

/**
 * Blocco della pagina come riga compatta: titolo e riassunto, la tabella si apre al tocco. Con `children` assente (anno senza
 * movimenti) resta una riga tratteggiata che non si apre. Così la pagina si scorre in un colpo d'occhio anche su telefono.
 */
function DraftFold({ title, icon, summary, children }: { title: string; icon: IconName; summary: ReactNode; children?: ReactNode }) {
  const head = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-blue/10 text-brand-blue dark:bg-nav dark:text-gold">
        <Icon name={icon} size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <h2 className="font-display text-2xl leading-none font-extrabold sm:text-3xl">{title}</h2>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">{summary}</span>
      </span>
    </>
  );
  if (!children)
    return (
      <section className="rise mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-3.5">{head}</section>
    );
  return (
    <details className="group rise mt-4">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-foreground/25 group-open:border-brand-blue/40 [&::-webkit-details-marker]:hidden">
        {head}
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-brand-blue">
          <span className="hidden sm:inline sm:group-open:hidden">Mostra</span>
          <span className="hidden sm:group-open:inline">Chiudi</span>
          <Icon name="chevron" size={18} strokeWidth={2.2} className="rotate-90 transition-transform group-open:-rotate-90" />
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** Stemmi in fila, sovrapposti: chi ha ricevuto le pick di un anno. */
function CrestStack({ ids, name, color }: { ids: string[]; name: (id: string) => string; color: (id: string) => string }) {
  return (
    <span className="flex -space-x-1.5" aria-hidden>
      {ids.map((id) => (
        <TeamCrest key={id} name={name(id)} color={color(id)} size="xs" />
      ))}
    </span>
  );
}

export default async function DraftPage() {
  const league = await loadLeague();
  const { draftRounds: roundCount, pickHorizonYears } = league.settings;
  const ROUNDS = Array.from({ length: roundCount }, (_, i) => i + 1);
  const years = [...new Set(league.picks.map((p) => p.year))].sort();
  const name = (id: string | null) => (id ? league.teamNames.get(id) ?? "?" : "da definire");
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const color = (id: string | null) => (id ? colors.get(id) ?? "#555" : "#555");
  const hasPending = league.picks.some((p) => p.to_confirm);
  const traded = league.picks.filter((p) => p.current_team_id !== p.original_team_id).length;
  const untouched = (y: number) => {
    const picks = league.picks.filter((p) => p.year === y);
    return picks.length === league.teams.length * roundCount && picks.every((p) => p.current_team_id === p.original_team_id && !p.to_confirm);
  };
  // L'ordine del draft si registra alla chiusura: il proprietario di adesso si legge dalle pick, così gli scambi successivi si vedono.
  const slot = (r: (typeof league.rookieDraft)[number]) => {
    if (!r.original_team_id) return { teamId: r.team_id, note: r.note };
    const round = Math.ceil(r.pick_no / league.teams.length);
    const pick = league.picks.find((p) => p.year === league.seasonYear && p.round === round && p.original_team_id === r.original_team_id);
    const teamId = pick?.current_team_id ?? r.team_id;
    return { teamId, note: teamId === r.original_team_id ? "" : `Da ${name(r.original_team_id)}` };
  };
  const perRound = Math.max(1, league.teams.length);
  const orderRounds = [...new Set(league.rookieDraft.map((r) => Math.ceil(r.pick_no / perRound)))];
  const firstPick = league.rookieDraft.find((r) => r.pick_no === 1) ?? league.rookieDraft[0];
  const first = firstPick ? slot(firstPick) : null;

  return (
    <>
      <PageTitle
        icon="ticket"
        eyebrow="Pick e rookie draft"
        sub={
          <>
            {roundCount} giri, una scelta per squadra e per giro. Si scambiano solo le scelte dei prossimi {pickHorizonYears === 1 ? "anno" : `${pickHorizonYears} anni`}. Nella griglia il pallino grigio è una scelta ancora della
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

      {years.map((y, yi) => {
        const picks = league.picks.filter((p) => p.year === y);
        const moved = picks.filter((p) => p.current_team_id !== p.original_team_id).length;
        // Anni di fila senza movimenti (nessuno scambio, niente da confermare, nessun buco): griglie di soli pallini grigi non
        // dicono niente, basta una riga per tutto il blocco.
        if (untouched(y)) {
          if (yi > 0 && untouched(years[yi - 1])) return null;
          const end = years.findIndex((x, i) => i > yi && !untouched(x));
          const run = years.slice(yi, end === -1 ? undefined : end);
          const last = run[run.length - 1];
          return (
            <DraftFold
              key={y}
              title={last === y ? `Draft ${y}` : `Draft ${y}–${last}`}
              icon="ticket"
              summary={
                <span>
                  <span className="font-semibold text-foreground">Nessuno scambio:</span> {run.length > 1 ? "ogni anno" : "tutte"} le {picks.length} scelte sono delle squadre di
                  origine
                </span>
              }
            />
          );
        }
        const receivers = [...new Set(picks.filter((p) => p.current_team_id && p.current_team_id !== p.original_team_id).map((p) => p.current_team_id!))];
        const pending = picks.filter((p) => p.to_confirm).length;
        return (
          <DraftFold
            key={y}
            title={`Draft ${y}`}
            icon="ticket"
            summary={
              <>
                <span>
                  <span className="font-semibold text-foreground">
                    {moved} {moved === 1 ? "scelta scambiata" : "scelte scambiate"}
                  </span>
                  {receivers.length > 0 && " · ora a"}
                </span>
                {receivers.length > 0 && <CrestStack ids={receivers} name={name} color={color} />}
                {pending > 0 && <Badge tone="warn">{pending} da confermare</Badge>}
              </>
            }
          >
            <div role="region" aria-label={`Pick del draft ${y} per squadra, scorri in orizzontale`} tabIndex={0} className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[21rem] border-collapse text-sm md:min-w-[40rem]">
                <caption className="sr-only">Chi possiede ora ogni pick del draft {y}, per squadra di origine e giro</caption>
                <thead>
                  <tr className="eyebrow border-b border-line bg-surface-subtle/60 text-left text-muted">
                    <th scope="col" className="sticky left-0 z-[1] bg-surface-subtle px-3 py-2 font-bold md:px-4">Pick di</th>
                    {ROUNDS.map((r) => (
                      <th key={r} scope="col" className="px-1 py-2 text-center font-bold md:px-2">
                        {/* Su telefono basta il numero: così tutti i giri stanno nello schermo. */}
                        <span aria-hidden className="md:hidden">{r}°</span>
                        <span className="sr-only md:not-sr-only">{r}° giro</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {league.teams.map(({ team }, ti) => (
                    <tr key={team.id} className="rise" style={stagger(ti)}>
                      <th scope="row" className="sticky left-0 z-[1] border-r border-line bg-surface px-3 py-2 text-left font-semibold whitespace-nowrap md:px-4">
                        <Link href={`/squadre/${team.id}`} className="flex min-h-11 max-w-[8.5rem] items-center gap-2 hover:underline sm:max-w-[11rem]">
                          <TeamCrest name={team.name} color={color(team.id)} size="xs" />
                          <span className="truncate">{team.name}</span>
                        </Link>
                      </th>
                      {ROUNDS.map((r) => {
                        const p = picks.find((x) => x.original_team_id === team.id && x.round === r);
                        return (
                          <td key={r} className="px-1 py-1.5 text-center md:px-2">
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
                                className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border p-1 text-xs font-bold transition-[filter] hover:brightness-95 md:pr-2"
                                style={{ borderColor: `color-mix(in oklab, ${color(p.current_team_id)} 45%, transparent)`, background: `color-mix(in oklab, ${color(p.current_team_id)} 12%, transparent)` }}
                              >
                                <TeamCrest name={name(p.current_team_id)} color={color(p.current_team_id)} size="xs" />
                                <span className="sr-only md:not-sr-only md:truncate">{name(p.current_team_id)}</span>
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
          </DraftFold>
        );
      })}

      {first && (
        <DraftFold
          title={`Ordine del draft ${league.seasonYear}`}
          icon="trophy"
          summary={
            <>
              <span>
                <span className="font-semibold text-foreground">{league.rookieDraft.length} scelte</span> in {orderRounds.length} giri · 1ª a
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
                <TeamCrest name={name(first.teamId)} color={color(first.teamId)} size="xs" />
                <span className="truncate">{name(first.teamId)}</span>
              </span>
            </>
          }
        >
          <div className="space-y-6">
            {orderRounds.map((round) => (
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
        </DraftFold>
      )}
    </>
  );
}
