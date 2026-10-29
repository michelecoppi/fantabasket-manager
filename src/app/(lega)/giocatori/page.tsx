import Form from "next/form";
import Link from "next/link";
import { ChipLinks, ViewSwitch } from "@/components/chips";
import { SubmitButton } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { DunkestSource, InjuryChip, PdkCell, PlayerSheet, SheetTrigger, sheetId } from "@/components/dunkest";
import type { TeamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { Badge, Empty, PageTitle, PosChip, Scoreboard, stagger } from "@/components/ui";
import { ValueList } from "@/components/value-board";
import type { DunkestView } from "@/lib/dunkest";
import type { LeagueView } from "@/lib/league";
import { fmt, POS_LABEL } from "@/lib/format";
import { loadDunkest, loadLeague, loadPlayers } from "@/lib/league-server";
import { filterPlayers, PAGE_SIZE, parseFilters, playerStatus } from "@/lib/players";
import { teamColors } from "@/lib/team-colors";
import { VALUE_MIN_GAMES, valueBoard, valueContracts } from "@/lib/value";

const control = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base outline-none transition-[border-color,box-shadow] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15";
const pagerLink = "font-display inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-lg font-extrabold transition-colors hover:border-foreground/40";
// Con i dati Dunkest c'è una colonna in più (PDK) prima dei crediti.
const cols = (withPdk: boolean) =>
  `md:grid md:items-center md:gap-4 ${withPdk ? "md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(8rem,11rem)_minmax(9rem,12rem)_3.5rem_4.5rem]" : "md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(8rem,11rem)_minmax(9rem,12rem)_4.5rem]"}`;

/**
 * Seconda vista (Fase 6.2, `?vista=affari`): affari e flop, cioè posizione per stipendio contro posizione per punteggio
 * Dunkest dei giocatori a contratto, con filtro per squadra (`?squadra=<id>`). Ogni riga apre la scheda del giocatore.
 */
function DealsView({ league, dunkest, teamFilter }: { league: LeagueView; dunkest: DunkestView; teamFilter: string | null }) {
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams: TeamIndex = new Map(league.teams.map((t) => [t.team.id, { name: t.team.name, owner: t.team.owner_name, color: colors.get(t.team.id) ?? "var(--muted)" }]));
  if (!dunkest.available) {
    return (
      <Empty title="Dati non disponibili" icon="chart">
        Servono i punteggi Dunkest, che in questo momento non si leggono.
      </Empty>
    );
  }
  // la classifica si calcola su tutta la lega; il filtro sceglie solo quali righe mostrare
  const all = valueBoard(valueContracts(league.teams), dunkest.stats, { size: Infinity });
  const keep = (r: { teamId: string }) => !teamFilter || r.teamId === teamFilter;
  const deals = all.deals.filter(keep).slice(0, 10);
  const flops = all.flops.filter(keep).slice(0, 10);
  const shown = [...deals, ...flops];
  const href = (id: string | null) => (id ? `/giocatori?vista=affari&squadra=${id}` : "/giocatori?vista=affari");
  return (
    <>
      <div className="mb-4">
        <ChipLinks
          label="Squadra"
          options={[
            { href: href(null), label: "Tutte", active: !teamFilter },
            ...[...league.teams]
              .sort((a, b) => a.team.name.localeCompare(b.team.name, "it"))
              .map((t) => ({ href: href(t.team.id), label: t.team.name, active: teamFilter === t.team.id })),
          ]}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ValueList kind="deal" rows={deals} pool={all.pool} teams={teams} dunkest={dunkest} />
        <ValueList kind="flop" rows={flops} pool={all.pool} teams={teams} dunkest={dunkest} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DunkestSource dunkest={dunkest} />
        <span className="text-xs text-muted">
          {all.pool} giocatori a contratto con almeno {VALUE_MIN_GAMES} partite, messi in fila per stipendio e per PDK medio. Tacca vuota = posizione per stipendio,
          tacca piena = posizione per rendimento. A pari valore la posizione è condivisa.
        </span>
      </div>
      {shown.map((r) => (
        <PlayerSheet
          key={r.playerId}
          player={{ playerId: r.playerId, name: r.name, pos: r.pos, nbaTeam: r.nbaTeam, owner: { name: teams.get(r.teamId)?.name ?? "?", color: colors.get(r.teamId) ?? "#555" } }}
          dunkest={dunkest}
        />
      ))}
    </>
  );
}

export default async function PlayersPage(props: PageProps<"/giocatori">) {
  const sp = await props.searchParams;
  const view = sp.vista === "affari" ? "deals" : "list";
  const filters = parseFilters(sp);
  const [listed, league, dunkest] = await Promise.all([loadPlayers(), loadLeague(), loadDunkest()]);
  const players = dunkest.available ? listed.map((p) => ({ ...p, pdk: dunkest.stats.get(p.id)?.pdk ?? null })) : listed;
  const withPdk = dunkest.available;
  const injuredCount = players.filter((p) => dunkest.injuries.has(p.id)).length;
  const nbaTeams = [...new Set(players.map((p) => p.nbaTeam).filter((t): t is string => !!t))].sort();
  const rows = filterPlayers(players, filters);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(filters.page ?? 1, pages);
  const offset = (page - 1) * PAGE_SIZE;
  const shown = rows.slice(offset, offset + PAGE_SIZE);
  const count = { free: 0, cut: 0, restricted: 0, taken: 0 };
  for (const p of players) count[playerStatus(p)]++;
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.pos) qs.set("ruolo", filters.pos);
    if (filters.nbaTeam) qs.set("nba", filters.nbaTeam);
    if (filters.owner !== "all") qs.set("stato", filters.owner);
    if (filters.sort !== "credits") qs.set("ordina", filters.sort);
    if (n > 1) qs.set("pagina", String(n));
    const s = qs.toString();
    return s ? `/giocatori?${s}` : "/giocatori";
  };
  const colors = teamColors(league.teams.map((t) => t.team.id));

  return (
    <>
      <PageTitle
        icon="jersey"
        eyebrow="Listone Dunkest"
        sub="Tutti i giocatori con crediti, squadra NBA e proprietario nella lega. Filtra per ruolo, squadra o stato."
        aside={
          <Scoreboard
            items={[
              { label: "Giocatori", value: players.length },
              { label: "Senza contratto", value: count.free + count.cut + count.restricted, tone: "gold" },
              { label: "Liberi", value: count.free },
              { label: "Tagliati", value: count.cut },
              { label: "Restricted", value: count.restricted },
              { label: "In rosa", value: count.taken },
            ]}
          />
        }
      >
        Giocatori
      </PageTitle>

      <div className="mb-5">
        <ViewSwitch
          label="Vista"
          options={[
            { href: "/giocatori", label: "Listone", hint: "tutti i giocatori, filtri e crediti", icon: "jersey", active: view === "list" },
            { href: "/giocatori?vista=affari", label: "Affari e flop", hint: "stipendio contro rendimento", icon: "trending-up", active: view === "deals" },
          ]}
        />
      </div>

      {view === "deals" ? (
        <DealsView league={league} dunkest={dunkest} teamFilter={typeof sp.squadra === "string" && league.teamNames.has(sp.squadra) ? sp.squadra : null} />
      ) : (
        <>

          <div className="z-10 rounded-2xl border border-line bg-surface/90 p-3 shadow-[0_12px_30px_-24px_rgb(6_10_20/0.6)] backdrop-blur-md md:sticky md:top-[4.5rem] md:shadow-[0_-0.5rem_0_0_var(--background),0_12px_30px_-24px_rgb(6_10_20/0.6)]">
            <Form className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(14rem,1.6fr)_repeat(4,minmax(8rem,1fr))_auto_auto]" action="/giocatori">
              <label className="relative col-span-2 lg:col-span-1">
                <span className="sr-only">Cerca per nome</span>
                <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={filters.q} placeholder="Cerca per nome…" autoComplete="off" spellCheck={false} className={`${control} pl-10`} />
              </label>
              <select name="ruolo" defaultValue={filters.pos} className={control} aria-label="Ruolo">
                <option value="">Tutti i ruoli</option>
                {(["G", "A", "C"] as const).map((p) => (
                  <option key={p} value={p}>
                    {POS_LABEL[p]}
                  </option>
                ))}
              </select>
              <select name="nba" defaultValue={filters.nbaTeam} className={control} aria-label="Squadra NBA">
                <option value="">Tutte le NBA</option>
                {nbaTeams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select name="stato" defaultValue={filters.owner} className={control} aria-label="Stato">
                <option value="all">Tutti gli stati</option>
                <option value="free">Senza contratto (tutti)</option>
                <option value="open">Liberi (senza vincoli)</option>
                <option value="cut">Tagliati (in asta)</option>
                <option value="restricted">Restricted</option>
                <option value="taken">In rosa</option>
              </select>
              <select name="ordina" defaultValue={filters.sort} className={control} aria-label="Ordina per">
                <option value="credits">Per crediti</option>
                <option value="name">Per nome</option>
                {withPdk && <option value="pdk">Per punteggio Dunkest</option>}
              </select>
              <SubmitButton icon="sliders">Filtra</SubmitButton>
              <Link
                href="/giocatori"
                className="font-display inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-lg font-extrabold transition-colors hover:border-foreground/40"
              >
                Azzera
              </Link>
            </Form>
          </div>

          <div className="mt-5 mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-sm font-semibold text-muted">
              {rows.length} risultati
              {rows.length > PAGE_SIZE && ` · ${offset + 1}–${offset + shown.length} (pagina ${page} di ${pages})`}
              {injuredCount > 0 && ` · ${injuredCount} infortunati nel listone`}
            </p>
            <DunkestSource dunkest={dunkest} />
          </div>

          {shown.length === 0 ? (
            <Empty title="Nessun giocatore" icon="search">
              Nessun giocatore con questi filtri.
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className={`eyebrow hidden border-b border-line bg-surface-subtle/60 px-4 py-2 text-muted ${cols(withPdk)}`}>
                <span>#</span>
                <span>Giocatore</span>
                <span>NBA</span>
                <span>Stato</span>
                {withPdk && (
                  <span className={`text-right ${filters.sort === "pdk" ? "text-brand-blue" : ""}`} title="Punteggio Dunkest medio a partita">
                    PDK
                  </span>
                )}
                <span className={`text-right ${filters.sort === "credits" ? "text-brand-blue" : ""}`}>Crediti</span>
              </div>
              <ul className="divide-y divide-line">
                {shown.map((p, i) => (
                  <li key={p.id} className={`rise relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle/60 sm:px-4 ${cols(withPdk)}`} style={stagger(i)}>
                    {withPdk && <SheetTrigger id={sheetId(p.id)} name={p.name} />}
                    <span className="tnum hidden text-sm font-semibold text-muted md:block">{offset + i + 1}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <PosChip pos={p.pos} />
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold">{p.name}</span>
                          {dunkest.injuries.has(p.id) && <InjuryChip injury={dunkest.injuries.get(p.id)!} />}
                        </span>
                        <span className="block truncate text-xs text-muted md:hidden">
                          {p.nbaTeam ?? "NBA n.d."}
                          {!p.ownerTeamId && !p.cutByTeamId && p.restrictedTeamId && ` · può pareggiare ${league.teamNames.get(p.restrictedTeamId) ?? "?"}`}
                        </span>
                        {!p.ownerTeamId && !p.cutByTeamId && p.restrictedTeamId && (
                          <span className="hidden truncate text-xs text-muted md:block">può pareggiare {league.teamNames.get(p.restrictedTeamId) ?? "?"}</span>
                        )}
                      </span>
                    </span>
                    <span className="hidden truncate text-sm font-semibold text-muted md:block">{p.nbaTeam ?? "n.d."}</span>
                    <span className="min-w-0 shrink-0">
                      {p.ownerTeamId ? (
                        <Link href={`/squadre/${p.ownerTeamId}`} className="relative z-[2] inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2 text-sm font-semibold hover:underline">
                          <TeamCrest name={league.teamNames.get(p.ownerTeamId) ?? "?"} color={colors.get(p.ownerTeamId) ?? "#555"} size="xs" />
                          <span className="hidden max-w-28 truncate sm:inline">{league.teamNames.get(p.ownerTeamId) ?? "?"}</span>
                        </Link>
                      ) : p.cutByTeamId ? (
                        <Badge tone="warn" title={`Tagliato da ${league.teamNames.get(p.cutByTeamId) ?? "?"}`}>
                          tagliato
                        </Badge>
                      ) : p.restrictedTeamId ? (
                        <Badge tone="warn" title="Restricted: il vecchio proprietario può pareggiare l'offerta più alta (R-23)">
                          restricted
                        </Badge>
                      ) : (
                        <Badge tone="good" icon="check">
                          libero
                        </Badge>
                      )}
                    </span>
                    {withPdk && (
                      <span className="flex shrink-0 justify-end">
                        <PdkCell stats={dunkest.stats.get(p.id)} role={p.pos ? dunkest.roles[p.pos] : dunkest.all} />
                      </span>
                    )}
                    <span className="font-display tnum w-12 shrink-0 text-right text-2xl leading-none font-black md:w-auto">{p.credits === null ? "–" : fmt(p.credits)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {withPdk &&
            shown.map((p) => (
              <PlayerSheet
                key={p.id}
                player={{
                  playerId: p.id,
                  name: p.name,
                  pos: p.pos,
                  nbaTeam: p.nbaTeam,
                  owner: p.ownerTeamId ? { name: league.teamNames.get(p.ownerTeamId) ?? "?", color: colors.get(p.ownerTeamId) ?? "#555" } : null,
                }}
                dunkest={dunkest}
              />
            ))}

          {pages > 1 && (
            <nav aria-label="Paginazione" className="mt-4 flex items-center justify-between gap-3">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className={pagerLink}>
                  ← Precedente
                </Link>
              ) : (
                <span aria-hidden className={`${pagerLink} invisible`}>
                  ← Precedente
                </span>
              )}
              <span className="text-sm font-semibold text-muted">
                Pagina {page} di {pages}
              </span>
              {page < pages ? (
                <Link href={pageHref(page + 1)} className={pagerLink}>
                  Successiva →
                </Link>
              ) : (
                <span aria-hidden className={`${pagerLink} invisible`}>
                  Successiva →
                </span>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
