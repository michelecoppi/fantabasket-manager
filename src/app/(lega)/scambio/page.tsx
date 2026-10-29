import Link from "next/link";
import { ViewSwitch } from "@/components/chips";
import { PageTitle, Scoreboard } from "@/components/ui";
import { loadLeague, loadProfile, loadProposals, loadTradeMarket, loadVersions } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { staleMoves } from "@/lib/trade-draft";
import { awaitsAnswer, groupProposals, isOpen, proposalBadges } from "@/lib/trade-proposals";
import { ProposalsView } from "./proposals";
import { TradeSimulator, type CounterOf } from "./simulator";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Scambi: simulatore (trade machine, da cui una squadra propone) e, con `?vista=proposte`, le proposte della tua squadra
 * (Fase 7.3). `?controproposta=<id>` apre il simulatore già compilato con una proposta aperta in cui la tua squadra è dentro.
 */
export default async function TradePage(props: PageProps<"/scambio">) {
  const sp = await props.searchParams;
  const view = one(sp.vista) === "proposte" ? "proposals" : "machine";
  const [league, versions, profile, market, proposals] = await Promise.all([loadLeague(), loadVersions(), loadProfile(), loadTradeMarket(), loadProposals()]);
  const teams = simTeams(league, versions);
  const myTeamId = profile?.team_id ?? null;
  const admin = profile?.role === "admin";
  const list = proposals ?? [];
  const badges = proposalBadges(list, myTeamId, admin);

  // Controproposta (o proposta rifatta da chi l'ha mandata): solo da una proposta aperta della tua squadra; i movimenti che
  // non valgono più restano fuori dalla bozza.
  const counterId = Number(one(sp.controproposta));
  const parent = list.find((p) => p.id === counterId && isOpen(p) && !!myTeamId && (awaitsAnswer(p, myTeamId) || p.proposerTeamId === myTeamId));
  const counterOf: CounterOf | undefined = parent && {
    id: parent.id,
    teams: parent.teams,
    moves: parent.moves.filter((m) => !staleMoves(teams, [m]).length).map(({ kind, id, version, from, to, slot }) => ({ kind, id, version, from, to, ...(slot ? { slot } : {}) })),
    own: parent.proposerTeamId === myTeamId,
  };

  return (
    <>
      <PageTitle
        icon="swap"
        eyebrow={view === "proposals" ? "Scambi · proposte" : "Trade machine"}
        sub={
          view === "proposals"
            ? `Le proposte della tua squadra: le altre squadre hanno ${league.settings.tradeProposalHours} ore per rispondere, poi un admin esegue lo scambio. Le vedono solo le squadre coinvolte e gli admin.`
            : `Simula uno scambio anche a più squadre (fino a ${league.settings.tradeMaxTeams}): controlla cap e massimi di rosa di ogni squadra, le pick non incidono sul cap. Con il mercato aperto puoi proporlo alle altre squadre.`
        }
        // Stato del mercato deciso da un admin (Fase 7.1); il simulatore funziona in entrambi i casi.
        aside={market === null ? undefined : <Scoreboard items={[{ label: "Mercato", value: market ? "Aperto" : "Chiuso", tone: market ? "gold" : undefined }]} />}
      >
        {view === "proposals" ? "Proposte di scambio" : "Simulatore di scambio"}
      </PageTitle>

      <div className="mb-5">
        <ViewSwitch
          label="Vista"
          options={[
            { href: "/scambio", label: "Simulatore", hint: "prepara e proponi uno scambio", icon: "swap", active: view === "machine" },
            {
              href: "/scambio?vista=proposte",
              label: badges.answer > 0 ? `Proposte · ${badges.answer}` : "Proposte",
              hint: badges.answer > 0 ? `${badges.answer === 1 ? "una aspetta" : `${badges.answer} aspettano`} la tua risposta` : "inviate, ricevute, archivio",
              icon: "clipboard",
              active: view === "proposals",
            },
          ]}
        />
      </div>

      {view === "proposals" ? (
        proposals === null ? (
          <p className="text-sm text-muted">Proposte non disponibili al momento: aggiorna la pagina.</p>
        ) : (
          <ProposalsView
            groups={groupProposals(list, myTeamId)}
            teams={teams}
            settings={league.settings}
            myTeamId={myTeamId}
            market={market}
            adminQueue={admin ? badges.admin : null}
          />
        )
      ) : (
        <>
          <p className="mb-4 text-sm">
            <Link href="/storico-scambi" className="font-semibold text-brand-blue hover:underline">
              Vedi lo storico degli scambi →
            </Link>
          </p>
          <TradeSimulator key={counterOf?.id ?? "new"} teams={teams} settings={league.settings} myTeamId={myTeamId} market={market} counterOf={counterOf} />
        </>
      )}
    </>
  );
}
