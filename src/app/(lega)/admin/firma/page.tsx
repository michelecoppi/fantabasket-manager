import { PageTitle } from "@/components/ui";
import { loadLeague, loadPlayers } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { SignDesk } from "./desk";

export default async function AdminSignPage() {
  const [league, players] = await Promise.all([loadLeague(), loadPlayers()]);
  return (
    <>
      <PageTitle icon="pen" eyebrow="Area admin" sub="Un giocatore libero entra in una rosa. Cap e composizione sono mostrati come avvisi: non bloccano la firma.">
        Firma un contratto
      </PageTitle>
      <SignDesk teams={simTeams(league)} free={players.filter((p) => !p.ownerTeamId)} settings={league.settings} />
    </>
  );
}
