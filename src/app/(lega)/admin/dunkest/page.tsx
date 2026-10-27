import { DunkestSource } from "@/components/dunkest";
import { Icon } from "@/components/icons";
import { Badge, Empty, PageTitle, Scoreboard, Section, stagger } from "@/components/ui";
import { syncState, type LinkReport } from "@/lib/dunkest";
import { fmtDateTime } from "@/lib/format";
import { loadDunkest } from "@/lib/league-server";
import { createClient } from "@/lib/supabase/server";
import { DunkestSyncButton } from "./sync-button";

const RUNS = 30;

interface RunRow {
  id: number;
  at: string;
  trigger: "cron" | "admin";
  user_id: string | null;
  ok: boolean;
  stats_count: number | null;
  injuries_count: number | null;
  links_count: number | null;
  error: string | null;
  report: LinkReport | null;
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

const reportIssues = (r: LinkReport | null) => (r ? r.ambiguous.length + r.rosteredWithoutStats.length : 0);

/**
 * Job giornaliero Dunkest (issue #68): stato attuale, rilancio a mano, storico delle esecuzioni (cron e admin) con esito,
 * conteggi, errore e report dei giocatori non collegati.
 */
export default async function AdminDunkestPage() {
  const db = await createClient();
  const [dunkest, runsRes] = await Promise.all([
    loadDunkest(),
    db.from("dunkest_sync_runs").select("id,at,trigger,user_id,ok,stats_count,injuries_count,links_count,error,report").order("id", { ascending: false }).limit(RUNS),
  ]);
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
        sub="Punteggio medio, partite giocate e infortuni si scaricano da Dunkest ogni mattina verso le 9 (ora solare; le 10 con l'ora legale). Se un tentativo fallisce le pagine continuano a mostrare gli ultimi dati validi."
        aside={
          <Scoreboard
            items={[
              { label: "Ultimo esito", value: state === "ok" ? "OK" : state === "failed" ? "Fallito" : "–", tone: state === "failed" ? "bad" : state === "ok" ? "gold" : undefined },
              { label: "Con statistiche", value: dunkest.stats.size },
              { label: "Infortunati", value: dunkest.injuries.size },
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
              const issues = reportIssues(r.report);
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
                          {r.trigger === "cron" ? (
                            <Badge icon="clock">Automatico</Badge>
                          ) : (
                            <Badge tone="accent" icon="user">
                              {r.user_id ? (who.get(r.user_id) ?? "Admin") : "Admin"}
                            </Badge>
                          )}
                        </div>
                        <p className={`mt-0.5 truncate text-xs ${r.ok ? "text-muted" : "text-danger"}`}>
                          {r.ok ? (
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
                      {r.ok && r.report ? (
                        <Report report={r.report} />
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
