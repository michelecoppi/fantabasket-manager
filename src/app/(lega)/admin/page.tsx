import Link from "next/link";
import { adminTodo, adminTodoCounts } from "@/lib/admin-todo";
import { auditLabel, type AuditRow } from "@/lib/audit";
import { Empty, PageTitle, Section } from "@/components/ui";
import { loadProposals, loadSlotSwaps } from "@/lib/league-server";
import { createClient } from "@/lib/supabase/server";
import { TodoList, ToolGrid } from "./overview";

const when = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

async function RecentOperations() {
  const db = await createClient();
  // Una riga per operazione: lo scambio scrive anche una riga per ogni giocatore/pick, ma solo quella su `trades` ha il riepilogo.
  const { data, error } = await db
    .from("audit_log")
    .select("id,at,action,after")
    .not("after->>summary", "is", null)
    .order("id", { ascending: false })
    .limit(12);
  if (error) return <p className="text-sm text-muted">Registro non disponibile: {error.message}</p>;
  const rows = (data ?? []) as AuditRow[];
  if (rows.length === 0) return <Empty title="Nessuna operazione registrata" icon="ledger" />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3">
          <span className="font-display w-32 text-base font-extrabold text-brand-blue">{auditLabel(r.action)}</span>
          <span className="min-w-0 flex-1 basis-48 text-sm">
            {r.after?.summary}
            {r.after?.cap_override_reason && <span className="block text-xs text-muted">Eccezione cap: {r.after.cap_override_reason}</span>}
          </span>
          <time dateTime={r.at} className="text-xs text-muted tabular-nums">{when.format(new Date(r.at))}</time>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminHome() {
  const [proposals, swaps] = await Promise.all([loadProposals().catch(() => null), loadSlotSwaps().catch(() => null)]);
  const todo = adminTodo(proposals ?? [], swaps ?? []);
  const counts = adminTodoCounts(todo);
  return (
    <>
      <PageTitle icon="badge" eyebrow="Area admin · ogni modifica finisce nel registro" sub="Strumenti per aggiornare la lega. Ogni operazione tocca più tabelle insieme e viene annullata per intero se qualcosa non va.">Pannello admin</PageTitle>
      <TodoList todo={todo} />
      <ToolGrid counts={counts} />
      <Section title="Ultime operazioni" icon="ledger">
        <RecentOperations />
        <p className="mt-2 text-right text-sm"><Link className="font-semibold text-brand-blue" href="/admin/registro">Tutto il registro →</Link></p>
      </Section>
    </>
  );
}
