import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { AUDIT_ACTIONS, TABLE_LABELS, auditLabel, type AuditDetail, type AuditRow } from "@/lib/audit";
import { auditChanges } from "@/lib/trades";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 30;
const when = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function href(page: number, action: string) {
  const q = new URLSearchParams();
  if (page > 1) q.set("page", String(page));
  if (action) q.set("tipo", action);
  const s = q.toString();
  return `/admin/registro${s ? `?${s}` : ""}`;
}

export default async function AdminLogPage({ searchParams }: PageProps<"/admin/registro">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  const action = one(sp.tipo) in AUDIT_ACTIONS ? one(sp.tipo) : "";

  const db = await createClient();
  // Una riga per operazione: lo scambio scrive anche una riga per ogni giocatore/pick, ma solo quella di riepilogo ha il testo.
  let query = db
    .from("audit_log")
    .select("id,at,action,user_id,after", { count: "exact" })
    .not("after->>summary", "is", null)
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (action) query = query.eq("action", action);
  const { data, error, count } = await query;
  const rows = (data ?? []) as AuditRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Operatore e righe di dettaglio (stessa transazione = stesso `at` e stesso utente) solo per le righe della pagina.
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((u): u is string => !!u))];
  const ats = [...new Set(rows.map((r) => r.at))];
  const [profiles, details] = await Promise.all([
    userIds.length ? db.from("profiles").select("id,display_name").in("id", userIds) : { data: [] },
    ats.length ? db.from("audit_log").select("at,user_id,table_name,row_id,before,after").in("at", ats).is("after->>summary", null).order("id") : { data: [] },
  ]);
  const operator = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name] as const));
  const detailsOf = (r: AuditRow) => ((details.data ?? []) as AuditDetail[]).filter((d) => d.at === r.at && d.user_id === r.user_id);

  return (
    <>
      <PageTitle icon="ledger" eyebrow="Area admin" sub="Tutte le operazioni degli admin, dalla più recente. Ogni riga è una transazione completa.">Registro operazioni</PageTitle>

      <nav aria-label="Filtra per tipo" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[["", "Tutte"], ...Object.entries(AUDIT_ACTIONS)].map(([key, label]) => (
          <Link
            key={key}
            href={href(1, key)}
            aria-current={key === action ? "page" : undefined}
            className={`min-h-11 rounded-full border px-3 py-1 text-sm font-semibold whitespace-nowrap transition ${
              key === action ? "border-brand-blue bg-brand-blue text-white dark:text-nav" : "border-line bg-surface text-muted hover:border-brand-blue hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {error ? (
        <p className="text-sm text-muted">Registro non disponibile: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nessuna operazione registrata.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {rows.map((r) => {
            const changes = detailsOf(r).flatMap((d) => auditChanges(d.before, d.after).map((c) => ({ ...c, what: `${TABLE_LABELS[d.table_name] ?? d.table_name} #${d.row_id ?? "?"}` })));
            return (
              <li key={r.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-display w-32 text-sm font-bold text-accent">{auditLabel(r.action)}</span>
                  <span className="min-w-0 flex-1 basis-56 text-sm">
                    {r.after?.summary}
                    {r.after?.cap_override_reason && <span className="block text-xs text-muted">Eccezione cap: {r.after.cap_override_reason}</span>}
                  </span>
                  <span className="text-xs text-muted">{(r.user_id && operator.get(r.user_id)) || "Operatore sconosciuto"}</span>
                  <time dateTime={r.at} className="text-xs text-muted tabular-nums">{when.format(new Date(r.at))}</time>
                </div>
                {changes.length > 0 && (
                  <details className="mt-1 text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-brand-blue">Dettagli prima / dopo ({changes.length})</summary>
                    <ul className="mb-1 space-y-0.5 text-xs">
                      {changes.map((c, i) => (
                        <li key={i}>
                          <span className="text-muted">{c.what} · {c.field}:</span> {c.before} → <strong>{c.after}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className="font-semibold text-brand-blue" href={href(page - 1, action)}>← Più recenti</Link> : <span />}
          <span className="text-muted">Pagina {page} di {pages}</span>
          {page < pages ? <Link className="font-semibold text-brand-blue" href={href(page + 1, action)}>Più vecchie →</Link> : <span />}
        </div>
      )}
    </>
  );
}
