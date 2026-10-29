import { PageTitle } from "@/components/ui";
import { loadLeague, loadProposals, loadTradeMarket, loadVersions } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { awaitsDunkest } from "@/lib/trade-proposals";
import { TradeDesk } from "./desk";
import { MarketSwitch } from "./market";
import { ProposalQueue } from "./proposals";

export default async function AdminTradePage() {
  const [league, versions, market, proposals] = await Promise.all([loadLeague(), loadVersions(), loadTradeMarket(), loadProposals()]);
  const teams = simTeams(league, versions);
  const list = proposals ?? [];
  return (
    <>
      <PageTitle icon="swap" eyebrow="Area admin" sub="Approva le proposte accettate dalle squadre, oppure registra uno scambio a mano: il cap (R-57) è controllato prima di salvare, poi rose, pick e registro cambiano insieme o per niente.">
        Scambi
      </PageTitle>
      <MarketSwitch open={market} />
      {proposals === null ? (
        <p className="mb-10 text-sm text-muted">Proposte non disponibili al momento: aggiorna la pagina.</p>
      ) : (
        <ProposalQueue
          toApprove={list.filter((p) => p.status === "accepted")}
          toDunkest={list.filter(awaitsDunkest)}
          waiting={list.filter((p) => p.status === "pending").length}
          teams={teams}
          settings={league.settings}
        />
      )}
      <h2 className="font-display mb-3 text-3xl leading-none font-extrabold">Registra uno scambio</h2>
      <TradeDesk teams={teams} settings={league.settings} />
    </>
  );
}
