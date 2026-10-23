import Link from "next/link";
import { auditLabel, type AuditRow } from "@/lib/audit";
import { Card, PageTitle, Section } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const tools = [
  { href: "/admin/scambio", title: "Scambio", text: "Giocatori e pick tra due squadre, con controllo del cap (R-57) ed eccezione del moderatore.", icon: "M7 7h11l-3-3M17 17H6l3 3" },
  { href: "/admin/firma", title: "Firma", text: "Porta un giocatore libero in una rosa: stipendio, durata, team option.", icon: "M12 5v14M5 12h14" },
  { href: "/admin/rose", title: "Rose", text: "Fissa le durate, sposta titolari e riserve, taglia o rimuovi e chiudi i tagli dopo l'asta.", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/admin/pick", title: "Pick", text: "Correggi i proprietari, risolvi i «da confermare» e apri i nuovi draft.", icon: "M5 4h14v16H5zM9 9h6M9 13h6" },
  { href: "/admin/quote", title: "Quote", text: "Quota di iscrizione e luxury tax: chi ha pagato e quanto si deve.", icon: "M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.5 4 2.5 4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5" },
  { href: "/admin/chiusura", title: "Chiusura", text: "Fine stagione: classifica e bonus, lottery del draft, scadenza dei contratti e team option.", icon: "M5 12l5 5L20 7" },
  { href: "/admin/registro", title: "Registro", text: "Lo storico completo delle operazioni, con filtro per tipo.", icon: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" },
];

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
  if (rows.length === 0) return <p className="text-sm text-muted">Nessuna operazione registrata.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5">
          <span className="font-display w-32 text-sm font-bold text-brand-red">{auditLabel(r.action)}</span>
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
      <PageTitle sub="Strumenti per aggiornare la lega. Ogni operazione tocca più tabelle insieme e viene annullata per intero se qualcosa non va.">Pannello admin</PageTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {tools.map((t) => (
          <Link key={t.href} href={t.href} className="group">
            <Card className="h-full border-t-4 border-t-brand-blue p-4 transition group-hover:border-t-brand-red group-hover:shadow-md">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-red" aria-hidden>
                <path d={t.icon} />
              </svg>
              <h2 className="font-display mt-2 text-2xl font-bold">{t.title}</h2>
              <p className="mt-1 text-sm text-muted">{t.text}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Section title="Ultime operazioni">
        <RecentOperations />
        <p className="mt-2 text-right text-sm"><Link className="font-semibold text-brand-blue" href="/admin/registro">Tutto il registro →</Link></p>
      </Section>
    </>
  );
}
