import Link from "next/link";
import { PageTitle, Scoreboard } from "@/components/ui";
import { loadLeague, loadProfile, loadTradeMarket } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { TradeSimulator } from "./simulator";

export default async function TradePage() {
  const [league, profile, market] = await Promise.all([loadLeague(), loadProfile(), loadTradeMarket()]);
  return (
    <>
      <PageTitle
        icon="swap"
        eyebrow="Trade machine · sola lettura"
        sub={`Simulazione che non salva nulla, anche a più squadre (fino a ${league.settings.tradeMaxTeams}). Controlla cap e massimi di rosa di ogni squadra; le pick non incidono sul cap.`}
        // Stato del mercato deciso da un admin (Fase 7.1); il simulatore funziona in entrambi i casi.
        aside={market === null ? undefined : <Scoreboard items={[{ label: "Mercato", value: market ? "Aperto" : "Chiuso", tone: market ? "gold" : undefined }]} />}
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
