import { PageTitle } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { TradeSimulator } from "./simulator";

export default async function TradePage() {
  const league = await loadLeague();
  return (
    <>
      <PageTitle
        icon="swap"
        eyebrow="Trade machine · sola lettura"
        sub="Simulazione che non salva nulla. Controlla cap e massimi di rosa di entrambe le squadre; le pick non incidono sul cap."
      >
        Simulatore di scambio
      </PageTitle>
      <TradeSimulator teams={simTeams(league)} settings={league.settings} />
    </>
  );
}
