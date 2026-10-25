import Form from "next/form";
import Link from "next/link";
import { CapLine } from "@/components/cap-line";
import { SubmitButton } from "@/components/controls";
import { Badge } from "@/components/ui";
import { fmt, fmtEuro } from "@/lib/format";
import { loadLeague, loadProfile } from "@/lib/league-server";
import { listTeams, parseTeamListOptions } from "@/lib/teams-list";

const control = "min-h-11 w-full rounded-[2px] border border-line bg-surface px-3 text-base text-foreground";

function monogram(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export default async function Home(props: PageProps<"/">) {
  const options = parseTeamListOptions(await props.searchParams);
  const [league, profile] = await Promise.all([loadLeague(), loadProfile()]);
  const { settings } = league;
  const teams = listTeams(league.teams, options);
  const myTeam = league.teams.find((t) => t.team.id === profile?.team_id);
  const overCap = league.teams.filter((t) => t.finance.overCap).length;
  const incomplete = league.teams.filter((t) => t.warnings.length > 0).length;
  const myPicks = myTeam ? league.picks.filter((p) => p.current_team_id === myTeam.team.id).length : 0;

  return (
    <>
      <section className="overflow-hidden border border-nav bg-nav text-white lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(25rem,0.92fr)]" aria-labelledby="dashboard-title">
        <div className="flex flex-col px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <div>
            <p className="eyebrow text-neutral-400">Front office · Lega {league.seasonYear}</p>
            <h1 id="dashboard-title" className="font-display mt-5 text-[clamp(3.5rem,8vw,7.5rem)] leading-[0.78] font-extrabold tracking-[-0.025em]">
              Il cap detta<br /><span className="text-neutral-500">il gioco.</span>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-6 text-neutral-300 sm:text-base">
              Payroll, contratti e pick delle {league.teams.length} franchigie. Ogni scelta parte da qui.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/scambio" className="font-display inline-flex min-h-11 items-center bg-brand-red px-5 text-lg font-bold text-white transition-colors hover:bg-accent hover:text-nav">Simula uno scambio <span className="ml-3" aria-hidden>→</span></Link>
            <Link href="/giocatori" className="font-display inline-flex min-h-11 items-center border border-white/30 px-5 text-lg font-bold transition-colors hover:border-white hover:bg-white/5">Apri il listone</Link>
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-xs text-neutral-400">
            <div><dt className="eyebrow">Cap base</dt><dd className="mt-1 font-semibold text-white tabular-nums">{fmt(settings.cap)} crediti</dd></div>
            <div><dt className="eyebrow">Salary floor</dt><dd className="mt-1 font-semibold text-white tabular-nums">{fmt(settings.cap - settings.cap / settings.floorDivisor)}</dd></div>
            <div><dt className="eyebrow">Riserve</dt><dd className="mt-1 font-semibold text-white tabular-nums">{fmt(settings.reserveBudget)} crediti</dd></div>
          </dl>
        </div>

        <div className="border-t border-white/15 bg-white/[0.035] px-5 py-7 sm:px-8 lg:border-t-0 lg:border-l lg:px-8 lg:py-9">
          {myTeam ? (
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow text-neutral-400">La tua franchigia</p>
                  <Link href={`/squadre/${myTeam.team.id}`} className="font-display mt-2 inline-block text-4xl leading-none font-bold hover:underline">{myTeam.team.name}</Link>
                  <p className="mt-2 text-sm text-neutral-400">{myTeam.team.owner_name}</p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center border border-white/30 font-display text-xl font-bold">{monogram(myTeam.team.name)}</span>
              </div>
              <div className="my-7 border-y border-white/15 py-5">
                <p className="eyebrow text-neutral-400">{myTeam.finance.overCap ? "Oltre il cap" : "Spazio salariale"}</p>
                <p className="font-display mt-1 text-7xl leading-none font-extrabold tabular-nums sm:text-8xl">{fmt(myTeam.finance.capSpace)}</p>
                <p className="mt-2 text-xs text-neutral-400">crediti · cap effettivo {fmt(myTeam.finance.effectiveCap)}</p>
              </div>
              <CapLine payroll={myTeam.finance.payroll} cap={myTeam.finance.effectiveCap} dark />
              <dl className="mt-auto grid grid-cols-3 gap-3 pt-7">
                <div><dt className="eyebrow text-neutral-400">Titolari</dt><dd className="font-display mt-1 text-3xl font-bold tabular-nums">{myTeam.starters.length}<span className="text-lg text-neutral-500">/{settings.starters.G + settings.starters.A + settings.starters.C}</span></dd></div>
                <div><dt className="eyebrow text-neutral-400">Riserve</dt><dd className="font-display mt-1 text-3xl font-bold tabular-nums">{myTeam.reserves.length}</dd></div>
                <div><dt className="eyebrow text-neutral-400">Pick</dt><dd className="font-display mt-1 text-3xl font-bold tabular-nums">{myPicks}</dd></div>
              </dl>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <p className="eyebrow text-neutral-400">League pulse</p>
              <h2 className="font-display mt-2 text-5xl leading-[0.9] font-extrabold">La lega<br />in numeri.</h2>
              <dl className="my-7 divide-y divide-white/15 border-y border-white/15">
                <div className="flex items-end justify-between gap-4 py-4"><dt className="text-sm text-neutral-400">Franchigie</dt><dd className="font-display text-4xl font-bold tabular-nums">{league.teams.length}</dd></div>
                <div className="flex items-end justify-between gap-4 py-4"><dt className="text-sm text-neutral-400">Sopra il cap</dt><dd className="font-display text-4xl font-bold tabular-nums">{overCap}</dd></div>
                <div className="flex items-end justify-between gap-4 py-4"><dt className="text-sm text-neutral-400">Rose da completare</dt><dd className="font-display text-4xl font-bold tabular-nums">{incomplete}</dd></div>
              </dl>
              <p className="mt-auto text-sm leading-6 text-neutral-400">Il board mette a confronto budget e asset. Non è una classifica di campionato.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="league-board-title">
        <div className="flex flex-col gap-2 border-b-2 border-foreground pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-muted">League board · {league.seasonYear}</p>
            <h2 id="league-board-title" className="font-display mt-1 text-4xl leading-none font-extrabold">Squadra per squadra.</h2>
          </div>
          <p className="text-xs text-muted">{teams.length} di {league.teams.length} franchigie · non è una classifica</p>
        </div>

        <Form key={`${options.sort}-${options.filter}`} action="/" className="grid grid-cols-2 gap-3 border-b border-line py-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_auto_auto] sm:items-end">
          <label className="text-xs font-semibold text-muted">Ordina per
            <select name="ordina" defaultValue={options.sort} className={`${control} mt-1`}>
              <option value="nome">Nome</option>
              <option value="monte">Monte ingaggi</option>
              <option value="spazio">Spazio salariale</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">Mostra
            <select name="mostra" defaultValue={options.filter} className={`${control} mt-1`}>
              <option value="tutte">Tutte le squadre</option>
              <option value="sforate">Solo sforate</option>
              <option value="floor">Solo sotto floor</option>
              <option value="incomplete">Solo rose incomplete</option>
            </select>
          </label>
          <SubmitButton className="font-display min-h-11 rounded-[2px] bg-brand-red px-5 text-lg font-bold text-white transition-colors hover:bg-accent hover:text-nav">Applica</SubmitButton>
          <Link href="/" className="font-display inline-flex min-h-11 items-center justify-center rounded-[2px] border border-line px-5 text-lg font-bold transition-colors hover:border-foreground hover:bg-surface">Azzera</Link>
        </Form>

        {teams.length === 0 ? (
          <div className="border-b border-line px-4 py-12 text-center">
            <h3 className="font-display text-3xl font-bold">Nessuna franchigia trovata.</h3>
            <p className="mt-2 text-sm text-muted">Cambia il filtro oppure torna alla panoramica completa.</p>
            <Link href="/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-blue underline underline-offset-4">Azzera i filtri</Link>
          </div>
        ) : (
          <div>
            <div className="eyebrow hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(6rem,0.6fr))] gap-5 border-b border-line px-4 py-3 text-muted md:grid">
              <span>Franchigia / cap effettivo</span><span className="text-right">Payroll</span><span className="text-right">Spazio</span><span className="text-right">Riserve</span>
            </div>
            <ul>
              {teams.map((t) => {
                const f = t.finance;
                const mine = profile?.team_id === t.team.id;
                return (
                  <li key={t.team.id}>
                    <Link href={`/squadre/${t.team.id}`} className={`group block border-b border-line px-3 py-5 transition-colors hover:bg-surface sm:px-4 ${mine ? "border-l-2 border-l-highlight bg-highlight/[0.06]" : ""}`}>
                      <div className="grid gap-5 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(6rem,0.6fr))] md:items-center md:gap-5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center border border-line bg-nav font-display text-lg font-bold text-white">{monogram(t.team.name)}</span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <h3 className="font-display text-2xl leading-none font-bold group-hover:underline">{t.team.name}</h3>
                                {mine && <span className="eyebrow text-highlight">La tua</span>}
                              </div>
                              <p className="mt-1 truncate text-xs text-muted">{t.team.owner_name} · bonus {t.bonus > 0 ? "+" : ""}{t.bonus}</p>
                            </div>
                          </div>
                          <div className="mt-4 max-w-sm"><CapLine payroll={f.payroll} cap={f.effectiveCap} /></div>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {f.overCap && <Badge tone="bad">Budget sforato</Badge>}
                            {f.belowFloor && <Badge tone="warn" title={`Sotto il salary floor (${fmt(f.floor)})`}>Sotto floor</Badge>}
                            {t.warnings.length > 0 && <Badge title={t.warnings.join(" · ")}>Rosa incompleta</Badge>}
                            <span className={`text-xs ${t.entryFeePaid ? "text-success" : "text-muted"}`}>Quota {t.entryFeePaid ? "pagata" : "da pagare"}</span>
                            {f.luxuryTaxEur > 0 && <span className={`text-xs ${t.luxuryTaxPaid ? "text-success" : "text-danger"}`}>· Luxury tax {fmtEuro(f.luxuryTaxEur)} € {t.luxuryTaxPaid ? "pagata" : "da pagare"}</span>}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 border-t border-line pt-4 md:contents md:border-0 md:pt-0">
                          <div className="md:text-right"><div className="eyebrow text-muted md:hidden">Payroll</div><div className="font-display mt-1 text-3xl font-bold tabular-nums md:mt-0">{fmt(f.payroll)}</div></div>
                          <div className="md:text-right"><div className="eyebrow text-muted md:hidden">Spazio</div><div className={`font-display mt-1 text-3xl font-bold tabular-nums md:mt-0 ${f.overCap ? "text-danger" : ""}`}>{fmt(f.capSpace)}</div></div>
                          <div className="md:text-right"><div className="eyebrow text-muted md:hidden">Riserve</div><div className="font-display mt-1 text-3xl font-bold tabular-nums md:mt-0">{fmt(f.reserveSpace)}</div></div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
