import Link from "next/link";
import { notFound } from "next/navigation";
import { CapLine } from "@/components/cap-line";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { PlayerList, PlayerRow } from "@/components/player-row";
import { Badge, ContractPips, Empty, RestrictionBadge, Scoreboard, Section, stagger } from "@/components/ui";
import { fmt, fmtEuro, POS_LABEL } from "@/lib/format";
import type { RosterPlayer } from "@/lib/league";
import { loadLeague } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

function Roster({ players, offset = 0 }: { players: RosterPlayer[]; offset?: number }) {
  return (
    <PlayerList>
      {players.map((p, i) => (
        <PlayerRow
          key={p.id}
          i={offset + i}
          pos={p.pos}
          name={p.name}
          meta={p.nbaTeam ?? "NBA n.d."}
          badges={(p.rookie || p.restriction) && <RestrictionBadge rookie={p.rookie} restriction={p.restriction} />}
          contract={<ContractPips years={p.yearsLeft} option={p.teamOption} label={p.contractLabel} />}
          value={p.salary}
        />
      ))}
    </PlayerList>
  );
}

/** Contatore di ruolo: "Guardie 4/5" con tacche piene per i posti occupati. Su telefono le tacche vanno sotto, in tre colonne uguali. */
function SlotMeter({ label, have, need }: { label: string; have: number; need: number }) {
  const ok = have === need;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <span className="order-1 flex basis-full gap-[3px] sm:order-none sm:basis-auto" aria-hidden>
        {Array.from({ length: Math.max(need, have) }, (_, i) => (
          <span key={i} className={`h-2 w-4 rounded-sm ${i < have ? (i < need ? "bg-brand-blue" : "bg-danger") : "bg-foreground/12"}`} />
        ))}
      </span>
      <span className={`tnum text-xs font-bold ${ok ? "text-success" : "text-warning"}`}>
        {have}/{need}
      </span>
    </div>
  );
}

export default async function TeamPage(props: PageProps<"/squadre/[id]">) {
  const { id } = await props.params;
  const league = await loadLeague();
  const t = league.teams.find((x) => x.team.id === id);
  if (!t) notFound();
  const f = t.finance;
  const colors = teamColors(league.teams.map((x) => x.team.id));
  const color = colors.get(id) ?? "#1d47b5";
  const name = (teamId: string | null) => (teamId ? league.teamNames.get(teamId) ?? "?" : "da definire");

  const ownPicks = league.picks.filter((p) => p.current_team_id === id);
  const ceded = league.picks.filter((p) => p.original_team_id === id && p.current_team_id !== id);
  const years = [...new Set(ownPicks.map((p) => p.year))].sort();
  const positions = ["G", "A", "C"] as const;
  const unknownPos = t.starters.filter((x) => !x.pos);

  return (
    <>
      <Link href="/" className="mt-4 mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-blue hover:underline sm:mt-0">
        <Icon name="arrow-left" size={16} strokeWidth={2.2} />
        Lega
      </Link>

      <section className="arena sweep -mx-4 sm:mx-0 sm:rounded-3xl" aria-labelledby="team-title">
        <div aria-hidden className="absolute inset-0 -z-[1]" style={{ background: `radial-gradient(50rem 26rem at 0% 0%, color-mix(in oklab, ${color} 70%, transparent), transparent 65%)` }} />
        <div className="relative z-[2] grid gap-8 px-5 py-8 sm:px-9 sm:py-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex items-center gap-5 sm:gap-7">
            <TeamCrest name={t.team.name} color={color} size="xl" morphId={t.team.id} className="hidden sm:block" />
            <TeamCrest name={t.team.name} color={color} size="lg" className="sm:hidden" />
            <div className="min-w-0">
              <p className="rise eyebrow text-white/60">Franchigia · Stagione {league.seasonYear}</p>
              <h1 id="team-title" className="rise font-display mt-1 text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.85] font-black" style={stagger(1)}>
                {t.team.name}
              </h1>
              <p className="rise mt-2 text-sm text-white/65" style={stagger(2)}>
                {t.team.owner_name}
                {t.finalRank && ` · ${t.finalRank}° nella scorsa stagione`}
              </p>
            </div>
          </div>
          <div className="rise w-full lg:w-[30rem]" style={stagger(3)}>
            <Scoreboard
              items={[
                { label: "Payroll", value: fmt(f.payroll) },
                { label: `Cap ${t.bonus >= 0 ? "+" : "−"}${Math.abs(t.bonus)}`, value: fmt(f.effectiveCap) },
                { label: "Spazio", value: fmt(f.capSpace), tone: f.overCap ? "bad" : "gold" },
                { label: "Riserve", value: fmt(f.reserveSpace) },
              ]}
            />
            <div className="mt-4">
              <CapLine payroll={f.payroll} cap={f.effectiveCap} floor={f.floor} dark />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {f.overCap && (
          <Badge tone="bad" icon="flame">
            Budget sforato · luxury tax {fmtEuro(f.luxuryTaxEur)} €
          </Badge>
        )}
        {f.belowFloor && (
          <Badge tone="warn" icon="alert">
            Sotto il salary floor ({fmt(f.floor)})
          </Badge>
        )}
        {t.warnings.map((w) => (
          <Badge key={w} icon="clipboard">
            {w}
          </Badge>
        ))}
        <Badge tone={t.entryFeePaid ? "good" : "neutral"} icon={t.entryFeePaid ? "check" : "coins"}>
          Quota {t.entryFeePaid ? "pagata" : "da pagare"}
        </Badge>
      </div>

      <div className="mt-10 grid gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div>
          <Section title="Titolari" icon="jersey" aside={`${t.starters.length}/${positions.reduce((n, p) => n + league.settings.starters[p], 0)}`}>
            <div className="mb-3 grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
              {positions.map((p) => (
                <SlotMeter key={p} label={POS_LABEL[p]} have={t.starters.filter((x) => x.pos === p).length} need={league.settings.starters[p]} />
              ))}
            </div>
            {t.starters.length === 0 ? (
              <Empty title="Nessun titolare" icon="jersey" />
            ) : (
              <div className="space-y-4">
                {positions.map((p, gi) => {
                  const group = t.starters.filter((x) => x.pos === p);
                  if (group.length === 0) return null;
                  return (
                    <div key={p}>
                      <h3 className="eyebrow mb-1.5 text-muted">{POS_LABEL[p]}</h3>
                      <Roster players={group} offset={gi * 5} />
                    </div>
                  );
                })}
                {unknownPos.length > 0 && (
                  <div>
                    <h3 className="eyebrow mb-1.5 text-muted">Ruolo da indicare</h3>
                    <Roster players={unknownPos} offset={13} />
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="Riserve" icon="clipboard" aside={`${t.reserves.length} (min ${league.settings.reserveMin}, max ${league.settings.reserveMax})`}>
            {t.reserves.length === 0 ? <Empty title="Nessuna riserva" icon="clipboard" /> : <Roster players={t.reserves} />}
          </Section>
        </div>

        <aside>
          <Section title="Pick" icon="ticket" aside={`${ownPicks.length} possedute`}>
            {years.length === 0 ? (
              <Empty title="Nessuna pick" icon="ticket" />
            ) : (
              <div className="space-y-3">
                {years.map((y) => (
                  <div key={y} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="font-display mb-2 text-xl leading-none font-black">Draft {y}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ownPicks
                        .filter((p) => p.year === y)
                        .sort((a, b) => a.round - b.round)
                        .map((p) => {
                          const own = p.original_team_id === id;
                          return (
                            <span
                              key={p.id}
                              title={own ? "Propria" : `Da ${name(p.original_team_id)}`}
                              className={`relative inline-flex items-center gap-1.5 rounded-lg border py-1 pr-2.5 pl-2 text-sm font-semibold ${
                                p.to_confirm ? "border-warning/50 border-dashed bg-warning/10" : own ? "border-line bg-surface-subtle" : "border-brand-blue/40 bg-brand-blue/10"
                              }`}
                            >
                              <span className="font-display tnum text-lg leading-none font-black">{p.round}°</span>
                              {!own && (
                                <>
                                  <TeamCrest name={name(p.original_team_id)} color={colors.get(p.original_team_id) ?? "#555"} size="xs" />
                                  <span className="max-w-24 truncate text-xs">{name(p.original_team_id)}</span>
                                </>
                              )}
                              {p.to_confirm && <span className="text-xs font-bold text-warning">?</span>}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {ceded.length > 0 && (
              <div className="mt-3 rounded-2xl border border-dashed border-line p-3">
                <div className="eyebrow mb-1.5 text-muted">Cedute</div>
                <ul className="space-y-1 text-sm">
                  {ceded.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <span className="tnum font-semibold">
                        {p.year} {p.round}°
                      </span>
                      <Icon name="arrow-right" size={14} className="text-muted" />
                      <span className="truncate">{name(p.current_team_id)}</span>
                      {p.to_confirm && <span className="text-xs text-warning">(da confermare)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Talenti" icon="crown" aside={t.talents.length}>
            {t.talents.length === 0 ? (
              <Empty title="Nessun talento" icon="crown" />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {t.talents.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{x.display_name}</span>
                      {x.draft_year && (
                        <span className="block text-xs text-muted">
                          draft {x.draft_year}
                          {x.notes ? ` · ${x.notes}` : ""}
                        </span>
                      )}
                    </span>
                    {x.entry_credits !== null ? (
                      <span className="font-display tnum text-2xl font-black">{fmt(Number(x.entry_credits))}</span>
                    ) : (
                      <span title="Crediti non indicati" className="font-display text-2xl font-black text-muted/60">
                        <span aria-hidden>–</span>
                        <span className="sr-only">Crediti non indicati</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Tagliati" icon="x" aside="paga 1/3 dello stipendio">
            {t.cuts.length === 0 ? (
              <Empty title="Nessun taglio" icon="check" />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {t.cuts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-muted line-through decoration-danger/50">{c.name}</span>
                    <span className="font-display tnum text-2xl font-black text-danger">{fmt(c.paid)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
