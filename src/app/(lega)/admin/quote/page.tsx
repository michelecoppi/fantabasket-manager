import { PageTitle } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";
import { QuoteDesk } from "./desk";

export default async function AdminFeesPage() {
  const league = await loadLeague();
  return (
    <>
      <PageTitle sub="Segna chi ha pagato la quota di iscrizione e la luxury tax. La tassa dovuta si calcola dal monte ingaggi (R-12); l'importo della quota non è ancora stato definito.">
        Quote e luxury tax
      </PageTitle>
      <QuoteDesk
        teams={league.teams.map((t) => ({
          id: t.team.id,
          name: t.team.name,
          payroll: t.finance.payroll,
          effectiveCap: t.finance.effectiveCap,
          taxEur: t.finance.luxuryTaxEur,
          entryFeePaid: t.entryFeePaid,
          luxuryTaxPaid: t.luxuryTaxPaid,
        }))}
      />
    </>
  );
}
