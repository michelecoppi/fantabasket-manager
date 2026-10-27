import { DunkestSource } from "@/components/dunkest";
import { issuesText, LeagueSource, type TeamIndex } from "@/components/dunkest-league";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { Badge, Empty, PageTitle, Scoreboard, Section, stagger } from "@/components/ui";
import { syncState, type LinkReport } from "@/lib/dunkest";
import { checkLineup, rosterRefs, teamMatch, tokenDays, tokenState, type DunkestLeagueView, type LeagueReport } from "@/lib/dunkest-league";
import { fmtDateTime } from "@/lib/format";
import type { LeagueView } from "@/lib/league";
import { loadDunkest, loadLeague, loadLeagueDunkest, loadLineups } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";
import { createClient } from "@/lib/supabase/server";
import { DunkestSyncButton } from "./sync-button";

const RUNS = 30;

interface RunRow {
  id: number;
  kind: "stats" | "league";
  at: string;
  trigger: "cron" | "admin";
  user_id: string | null;
  ok: boolean;
  stats_count: number | null;
  injuries_count: number | null;
  links_count: number | null;
  error: string | null;
  report: LinkReport | LeagueReport | null;
}

/** Una voce del report, chiusa di default: si apre solo se serve controllare qualcuno. */
function ReportList({ title, hint, items, neutral = false }: { title: string; hint: string; items: string[]; neutral?: boolean }) {
  return (
    <details className="group border-t border-line first:border-t-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Icon name="chevron" size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
        <span className="flex-1">{title}</span>
        <span className={`tnum rounded-full px-2 py-0.5 text-xs font-bold ${items.length === 0 ? "bg-success/10 text-success" : neutral ? "bg-surface-subtle text-muted" : "bg-warning/12 text-warning"}`}>{items.length}</span>
      </summary>
      <div className="px-4 pb-3 pl-10">
        <p className="text-xs text-muted">{hint}</p>
        {items.length > 0 && <p className="mt-1.5 text-sm leading-6">{items.join(" · ")}</p>}
      </div>
    </details>
  );
}

function Report({ report }: { report: LinkReport }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <ReportList title="Aggiunti al listone" hint="Hanno giocato su Dunkest e non c'erano: il job li ha creati con ruolo, squadra NBA e crediti di Dunkest." items={report.added ?? []} neutral />
      <ReportList title="Collegamenti dubbi (omonimi)" hint="Voci Dunkest con più giocatori possibili anche guardando la squadra NBA: non collegate." items={report.ambiguous.map((a) => `${a.source} → ${a.candidates.join(" / ")}`)} />
      <ReportList title="In rosa senza dati Dunkest" hint="Né statistiche né infortuni: non hanno ancora giocato, oppure il nome è scritto diversamente." items={report.rosteredWithoutStats} />
      <ReportList title="Giocatori provvisori" hint="Solo cognome: non si collegano finché il nome non viene completato." items={report.provisional} />
      <ReportList title="Infortunati non nel listone" hint="Nella lista infortuni di Dunkest ma senza un giocatore della lega con lo stesso nome." items={report.injuriesUnlinked} />
    </div>
  );
}

function LeagueReportView({ report }: { report: LeagueReport }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <ReportList title="Schierati non collegati" hint="Giocatori nelle formazioni Dunkest senza un giocatore della lega con lo stesso nome: compaiono col solo nome." items={report.unlinked ?? []} />
      <ReportList title="Collegamenti dubbi (omonimi)" hint="Più giocatori della lega con lo stesso nome: non collegati." items={(report.ambiguous ?? []).map((a) => `${a.source} → ${a.candidates.join(" / ")}`)} />
    </div>
  );
}

const leagueReport = (r: RunRow): LeagueReport | null => (r.kind === "league" ? (r.report as LeagueReport | null) : null);
function reportIssues(r: RunRow): number {
  if (!r.report) return 0;
  const lr = leagueReport(r);
  if (lr) return (lr.unlinked?.length ?? 0) + (lr.ambiguous?.length ?? 0);
  const sr = r.report as LinkReport;
  return sr.ambiguous.length + sr.rosteredWithoutStats.length;
}

const since = (n: number) => (n === 0 ? "da oggi" : n === 1 ? "da 1 giorno" : `da ${n} giorni`);

/** Stato del token personale DUNKEST_TOKEN: funziona da quanti giorni, rifiutato (da rinnovare), mancante. */
function TokenCard({ view }: { view: DunkestLeagueView }) {
  const s = view.sync;
  const state = tokenState(s);
  const n = tokenDays(s, new Date());
  const box = { ok: "border-success/35 bg-success/8", rejected: "border-danger/45 bg-danger/8", missing: "border-warning/45 bg-warning/10", unknown: "border-line bg-surface" }[state];
  const dot = { ok: "bg-success text-white", rejected: "bg-danger text-white", missing: "bg-warning text-nav", unknown: "bg-surface-subtle text-muted" }[state];
  return (
    <div className={`rise flex gap-4 rounded-2xl border p-4 sm:p-5 ${box}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${dot}`}>
        <Icon name={state === "ok" ? "check" : state === "unknown" ? "key" : "alert"} size={22} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="font-display text-2xl leading-none font-extrabold">
          {state === "ok" && (n !== null ? `Token attivo ${since(n)}` : "Token attivo")}
          {state === "rejected" && "Token da rinnovare"}
          {state === "missing" && "Token non impostato"}
          {state === "unknown" && "Token mai provato"}
        </p>
        {state === "ok" && (
          <p className="text-sm text-muted">
            Ultimo uso riuscito {s?.tokenOkAt && fmtDateTime(s.tokenOkAt)}
            {s?.tokenOkSince && <> · funziona senza interruzioni dal {fmtDateTime(s.tokenOkSince)}</>}. Il conteggio serve a capire se e quando scade.
          </p>
        )}
        {state === "rejected" && (
          <div className="space-y-1 text-sm">
            <p>
              Dunkest ha rifiutato il token{s?.tokenRejectedAt && ` il ${fmtDateTime(s.tokenRejectedAt)}`}: classifica, calendario e formazioni restano quelli
              dell&apos;ultimo aggiornamento riuscito.
            </p>
            <p className="text-muted">
              Prendi un token nuovo come la prima volta, aggiorna la variabile <code className="font-semibold">DUNKEST_TOKEN</code> su Vercel (Production) e rifai il
              deploy, poi premi «Aggiorna ora». Non fare logout dall&apos;app Dunkest: il logout revoca il token.
            </p>
          </div>
        )}
        {state === "missing" && (
          <p className="text-sm">
            Manca la variabile <code className="font-semibold">DUNKEST_TOKEN</code> in questo ambiente: statistiche e infortuni si aggiornano, classifica e formazioni no.
          </p>
        )}
        {state === "unknown" && <p className="text-sm text-muted">Il token si prova al prossimo aggiornamento (cron delle 9 o «Aggiorna ora»).</p>}
      </div>
    </div>
  );
}

/** Divergenze tra le formazioni Dunkest dell'ultima giornata con punti e le rose dell'app, squadra per squadra. */
async function LineupIssues({ league, view, teams }: { league: LeagueView; view: DunkestLeagueView; teams: TeamIndex }) {
  const day = view.matchdays.find((d) => d.state === "latest");
  if (!day) return <p className="text-sm text-muted">Nessuna giornata con punti: niente da confrontare.</p>;
  const lineups = await loadLineups(day.matches.map((m) => m.id));
  const rosters = rosterRefs(league.teams);
  const rows = league.teams.map((t) => {
    const m = teamMatch(view, t.team.id, "latest");
    const lineup = m ? (lineups.get(m.match.id)?.get(t.team.id) ?? []) : [];
    const issues = lineup.length ? issuesText(checkLineup(t.team.id, lineup, t.starters.map((p) => p.playerId), rosters), teams) : [];
    return { t, read: lineup.length > 0, issues };
  });
  const total = rows.reduce((n, r) => n + r.issues.length, 0);
  return (
    <>
      {total === 0 && rows.every((r) => r.read) && (
        <div className="rise mb-3 flex items-center gap-3 rounded-2xl border border-success/30 bg-success/8 px-4 py-3">
          <Icon name="check" size={20} strokeWidth={2.4} className="shrink-0 text-success" />
          <p className="text-sm font-semibold">Giornata {day.matchday}: tutte le formazioni tornano con le rose dell&apos;app.</p>
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.map(({ t, read, issues }, i) => (
          <li key={t.team.id} className="rise flex items-start gap-3 px-3 py-3 sm:px-4" style={stagger(i)}>
            <TeamCrest name={t.team.name} color={teams.get(t.team.id)?.color ?? "var(--muted)"} size="sm" />
            <div className="min-w-0 flex-1">
              <a href={`/squadre/${t.team.id}#formazione`} className="font-semibold hover:underline">
                {t.team.name}
              </a>
              {!read ? (
                <p className="text-xs text-muted">Formazione non letta per la giornata {day.matchday}.</p>
              ) : issues.length === 0 ? (
                <p className="text-xs text-success">Formazione coerente con la rosa.</p>
              ) : (
                <ul className="mt-0.5 space-y-0.5 text-sm">
                  {issues.map((x) => (
                    <li key={x} className="flex gap-1.5">
                      <Icon name="alert" size={14} strokeWidth={2.4} className="mt-0.5 shrink-0 text-warning" />
                      {x}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {issues.length > 0 && <Badge tone="warn">{issues.length}</Badge>}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Job giornaliero Dunkest (issue #68): stato attuale, rilancio a mano, storico delle esecuzioni (cron e admin) con esito,
 * conteggi, errore e report dei giocatori non collegati.
 */
export default async function AdminDunkestPage() {
  const db = await createClient();
  const [dunkest, view, league, runsRes, mapRes] = await Promise.all([
    loadDunkest(),
    loadLeagueDunkest(),
    loadLeague(),
    db.from("dunkest_sync_runs").select("id,kind,at,trigger,user_id,ok,stats_count,injuries_count,links_count,error,report").order("id", { ascending: false }).limit(RUNS),
    db.from("dunkest_teams").select("team_id,dunkest_team_id,seasons!inner(is_current)").eq("seasons.is_current", true),
  ]);
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams: TeamIndex = new Map(league.teams.map((t) => [t.team.id, { name: t.team.name, owner: t.team.owner_name, color: colors.get(t.team.id) ?? "var(--muted)" }]));
  const dunkestTeamOf = new Map((mapRes.data ?? []).map((r) => [r.team_id as string, r.dunkest_team_id as number]));
  const token = tokenState(view.sync);
  const runs = (runsRes.data ?? []) as RunRow[];
  const userIds = [...new Set(runs.map((r) => r.user_id).filter((u): u is string => !!u))];
  const profiles = userIds.length ? await db.from("profiles").select("id,display_name").in("id", userIds) : { data: [] };
  const who = new Map((profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]));

  const sync = dunkest.sync;
  const state = dunkest.available ? syncState(sync) : null;
  const okRuns = runs.filter((r) => r.ok).length;

  return (
    <>
      <PageTitle
        icon="download"
        eyebrow="Area admin · job delle 9"
        sub="Punteggio medio, partite giocate e infortuni, poi classifica, calendario e formazioni della lega, si scaricano da Dunkest ogni mattina verso le 9 (ora solare; le 10 con l'ora legale). Se un tentativo fallisce le pagine continuano a mostrare gli ultimi dati validi."
        aside={
          <Scoreboard
            items={[
              { label: "Ultimo esito", value: state === "ok" ? "OK" : state === "failed" ? "Fallito" : "–", tone: state === "failed" ? "bad" : state === "ok" ? "gold" : undefined },
              { label: "Con statistiche", value: dunkest.stats.size },
              { label: "Token", value: token === "ok" ? "OK" : token === "rejected" ? "Scaduto" : token === "missing" ? "Manca" : "–", tone: token === "rejected" || token === "missing" ? "bad" : undefined },
              { label: `Riuscite (ult. ${runs.length})`, value: runs.length ? `${okRuns}/${runs.length}` : "–" },
            ]}
          />
        }
      >
        Dunkest
      </PageTitle>

      <Section title="Stato" icon="clock">
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0 space-y-2">
            <DunkestSource dunkest={dunkest} />
            {sync?.lastSuccessAt && (
              <p className="text-sm">
                Ultimo aggiornamento riuscito: <span className="font-semibold">{fmtDateTime(sync.lastSuccessAt)}</span>
                {sync.sourceUpdatedAt && <span className="text-muted"> · lista infortuni Dunkest del {fmtDateTime(sync.sourceUpdatedAt)}</span>}
              </p>
            )}
            {state === "failed" && sync?.lastError && (
              <p className="text-sm text-danger">
                Ultimo tentativo{sync.lastAttemptAt && ` (${fmtDateTime(sync.lastAttemptAt)})`}: {sync.lastError}
              </p>
            )}
            {state === "never" && <p className="text-sm text-muted">Nessun aggiornamento ancora: premi «Aggiorna ora» per il primo.</p>}
            {!dunkest.available && <p className="text-sm text-danger">Tabelle Dunkest non leggibili: la migrazione 20261027025827 è applicata su Supabase?</p>}
          </div>
          {dunkest.available && (
            <div className="shrink-0">
              <DunkestSyncButton />
            </div>
          )}
        </div>
      </Section>

      <Section title="Lega su Dunkest" icon="key">
        <div className="grid gap-3 lg:grid-cols-2">
          <TokenCard view={view} />
          <div className="rise space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm sm:p-5" style={stagger(1)}>
            <LeagueSource league={view} />
            {view.sync?.lastSuccessAt && (
              <p>
                Ultimo aggiornamento della lega: <span className="font-semibold">{fmtDateTime(view.sync.lastSuccessAt)}</span>
                {view.sync.calendarAt && <span className="text-muted"> · calendario completo riletto il {fmtDateTime(view.sync.calendarAt)} (ogni 7 giorni)</span>}
              </p>
            )}
            {view.sync?.lastError && view.sync.errorCode === "error" && (
              <p className="text-danger">
                Ultimo tentativo{view.sync.lastAttemptAt && ` (${fmtDateTime(view.sync.lastAttemptAt)})`}: {view.sync.lastError}
              </p>
            )}
            <p className="text-muted">
              {view.standings.length} squadre in classifica · {view.matchdays.length} giornate in calendario{view.latest ? ` · ultima con punti: ${view.latest}` : ""}
            </p>
          </div>
        </div>
      </Section>

      {view.available && (
        <Section title="Formazioni da controllare" icon="jersey" aside={view.latest ? `giornata ${view.latest}` : undefined}>
          <LineupIssues league={league} view={view} teams={teams} />
        </Section>
      )}

      <Section title="Squadre collegate" icon="shield" aside="id Dunkest">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {league.teams.map((t) => {
            const dk = dunkestTeamOf.get(t.team.id);
            return (
              <li key={t.team.id} className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 ${dk ? "border-line bg-surface" : "border-warning/45 bg-warning/10"}`}>
                <TeamCrest name={t.team.name} color={teams.get(t.team.id)?.color ?? "var(--muted)"} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.team.name}</span>
                <span className={`tnum text-xs ${dk ? "text-muted" : "font-bold text-warning"}`}>{dk ?? "non collegata"}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Esecuzioni" icon="ledger" aside={runs.length ? `ultime ${runs.length} · si tengono 90 giorni` : undefined}>
        {runsRes.error ? (
          <p className="text-sm text-danger">Storico non disponibile: {runsRes.error.message}</p>
        ) : runs.length === 0 ? (
          <Empty title="Nessuna esecuzione" icon="clock">
            Il primo giro parte domattina alle 9, oppure subito con «Aggiorna ora».
          </Empty>
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {runs.map((r, i) => {
              const issues = reportIssues(r);
              const lr = leagueReport(r);
              return (
                <li key={r.id} className="rise" style={stagger(i)}>
                  <details className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle/60 sm:px-4 [&::-webkit-details-marker]:hidden">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${r.ok ? "bg-success/12 text-success" : "bg-danger/10 text-danger"}`}>
                        <Icon name={r.ok ? "check" : "alert"} size={18} strokeWidth={2.4} />
                        <span className="sr-only">{r.ok ? "Riuscita" : "Fallita"}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <time dateTime={r.at} className="tnum font-semibold">
                            {fmtDateTime(r.at)}
                          </time>
                          {r.kind === "league" ? (
                            <Badge tone="accent" icon="trophy">
                              Lega
                            </Badge>
                          ) : (
                            <Badge icon="chart">Statistiche</Badge>
                          )}
                          {r.trigger === "cron" ? (
                            <Badge icon="clock">Automatico</Badge>
                          ) : (
                            <Badge tone="accent" icon="user">
                              {r.user_id ? (who.get(r.user_id) ?? "Admin") : "Admin"}
                            </Badge>
                          )}
                        </div>
                        <p className={`mt-0.5 truncate text-xs ${r.ok ? "text-muted" : "text-danger"}`}>
                          {r.ok && lr ? (
                            <>
                              classifica di {lr.standings ?? "?"} squadre · {lr.matches ?? "?"} scontri · {lr.lineups ?? 0} schierati
                              {lr.full ? " · calendario completo" : ""}
                              {r.links_count ? ` · ${r.links_count} nuovi collegamenti` : ""}
                            </>
                          ) : r.ok ? (
                            <>
                              {r.stats_count} con statistiche · {r.injuries_count} infortunati
                              {r.links_count ? ` · ${r.links_count} nuovi collegamenti` : ""}
                            </>
                          ) : (
                            r.error
                          )}
                        </p>
                      </div>
                      {r.ok && issues > 0 && (
                        <span className="hidden sm:inline-flex">
                          <Badge tone="warn" icon="alert">
                            {issues} da controllare
                          </Badge>
                        </span>
                      )}
                      <Icon name="chevron" size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t border-line bg-surface-subtle/40 px-3 py-3 sm:px-4">
                      {r.ok && lr ? (
                        <LeagueReportView report={lr} />
                      ) : r.ok && r.report ? (
                        <Report report={r.report as LinkReport} />
                      ) : (
                        <p className="text-sm">
                          {r.ok ? "Nessun report salvato." : <>Non è stato scritto nulla: restano i dati dell&apos;ultimo aggiornamento riuscito. Motivo: <span className="font-semibold">{r.error}</span></>}
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {sync?.report && (
        <Section title="Da controllare" icon="clipboard" aside="report dell'ultimo aggiornamento riuscito">
          <Report report={sync.report} />
        </Section>
      )}
    </>
  );
}
