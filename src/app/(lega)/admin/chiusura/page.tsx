import { loadLotteryData } from "@/components/lottery-gate";
import { PageTitle } from "@/components/ui";
import { loadCloseInput, loadLeague } from "@/lib/league-server";
import { ClosingDesk } from "./desk";

export default async function AdminClosePage() {
  const [league, input, lottery] = await Promise.all([loadLeague(), loadCloseInput(), loadLotteryData()]);
  // Il sorteggio conta solo se è di questa stagione (dopo la chiusura quello appena fatto riguarda la stagione chiusa).
  const drawn = lottery && lottery.data.record.seasonId === input.seasonId ? lottery.data : null;
  return (
    <>
      <PageTitle icon="trophy" eyebrow="Area admin" sub={`Registra la classifica finale ed estrai il sorteggio del draft: l'app calcola i bonus (R-60) e l'ordine del draft (R-32), fa uscire i contratti in scadenza e apre la stagione ${league.seasonYear + 1}.`}>
        Chiusura stagione {league.seasonYear}
      </PageTitle>
      <ClosingDesk input={input} settings={league.settings} lottery={drawn} />
    </>
  );
}
