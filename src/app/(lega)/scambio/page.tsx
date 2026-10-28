import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { loadLeague, loadProfile } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { TradeSimulator } from "./simulator";

export default async function TradePage() {
  const [league, profile] = await Promise.all([loadLeague(), loadProfile()]);
  return (
    <>
      <PageTitle
        icon="swap"
        eyebrow="Trade machine · sola lettura"
        sub={`Simulazione che non salva nulla, anche a più squadre (fino a ${league.settings.tradeMaxTeams}). Controlla cap e massimi di rosa di ogni squadra; le pick non incidono sul cap.`}
      >
        Simulatore di scambio
      </PageTitle>
      <p className="mb-4 text-sm">
        <Link href="/storico-scambi" className="font-semibold text-brand-blue hover:underline">Vedi lo storico degli scambi →</Link>
      </p>
      <TradeSimulator teams={simTeams(league)} settings={league.settings} myTeamId={profile?.team_id} />
    </>
  );
}
