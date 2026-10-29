import Link from "next/link";
import { auditLabel, type AuditRow } from "@/lib/audit";
import { Icon } from "@/components/icons";
import { Empty, PageTitle, Section, stagger } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { adminTools } from "./tools";


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

export default function AdminHome() {
  return (
    <>
      <PageTitle icon="badge" eyebrow="Area admin · ogni modifica finisce nel registro" sub="Strumenti per aggiornare la lega. Ogni operazione tocca più tabelle insieme e viene annullata per intero se qualcosa non va.">Pannello admin</PageTitle>
      {/* Con un numero dispari di strumenti l'ultimo prende due colonne: nessun buco in fondo alla griglia. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:[&>:last-child:nth-child(odd)]:col-span-2">
        {adminTools.map((t, i) => (
          <Link key={t.href} href={t.href} className="lift group rise relative overflow-hidden rounded-2xl border border-line bg-surface p-5 hover:border-foreground/25" style={stagger(i)}>
            <span aria-hidden className="absolute -top-6 -right-6 text-foreground/[0.04] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12">
              <Icon name={t.icon} size={120} strokeWidth={1.25} />
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-blue/10 text-brand-blue dark:bg-nav dark:text-gold transition-transform duration-300 group-hover:scale-105">
              <Icon name={t.icon} size={22} strokeWidth={2} />
            </span>
            <h2 className="font-display mt-4 flex items-center gap-1.5 text-3xl leading-none font-black">
              {t.label}
              <Icon name="arrow-right" size={18} strokeWidth={2.2} className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
            </h2>
            <p className="relative mt-2 text-sm text-muted">{t.text}</p>
          </Link>
        ))}
      </div>
      <Section title="Ultime operazioni" icon="ledger">
        <RecentOperations />
        <p className="mt-2 text-right text-sm"><Link className="font-semibold text-brand-blue" href="/admin/registro">Tutto il registro →</Link></p>
      </Section>
    </>
  );
}
