import { PageTitle } from "@/components/ui";
import { loadCloseInput, loadLeague } from "@/lib/league-server";
import { ClosingDesk } from "./desk";

export default async function AdminClosePage() {
  const [league, input] = await Promise.all([loadLeague(), loadCloseInput()]);
  return (
    <>
      <PageTitle icon="trophy" eyebrow="Area admin" sub={`Registra la classifica finale e la lottery: l'app calcola i bonus (R-60) e l'ordine del draft (R-32), fa uscire i contratti in scadenza e apre la stagione ${league.seasonYear + 1}.`}>
        Chiusura stagione {league.seasonYear}
      </PageTitle>
      <ClosingDesk input={input} settings={league.settings} />
    </>
  );
}
