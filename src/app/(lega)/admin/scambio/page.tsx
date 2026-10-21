import { PageTitle } from "@/components/ui";
import { loadLeague, loadVersions } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { TradeDesk } from "./desk";

export default async function AdminTradePage() {
  const [league, versions] = await Promise.all([loadLeague(), loadVersions()]);
  return (
    <>
      <PageTitle sub="Scegli le due squadre e ciò che cedono: il cap (R-57) è controllato prima di salvare, poi rose, pick e registro cambiano insieme o per niente.">
        Registra uno scambio
      </PageTitle>
      <TradeDesk teams={simTeams(league, versions)} settings={league.settings} />
    </>
  );
}
