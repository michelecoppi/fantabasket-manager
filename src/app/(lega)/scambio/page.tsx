import Link from "next/link";
import { ViewSwitch } from "@/components/chips";
import { PageTitle, Scoreboard } from "@/components/ui";
import type { DunkestView } from "@/lib/dunkest";
import type { LeagueView } from "@/lib/league";
import { loadDunkest, loadLeague, loadProfile, loadProposals, loadTradeMarket, loadVersions } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { decodeMoves, encodeMoves, staleMoves } from "@/lib/trade-draft";
import { awaitsAnswer, groupProposals, isOpen, proposalBadges } from "@/lib/trade-proposals";
import { TradeFinder } from "./finder";
import { ProposalsView } from "./proposals";
import { TradeSimulator, type StartDraft } from "./simulator";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** PDK Dunkest per id contratto (il cercatore lavora sui contratti); vuoto senza dati Dunkest. */
function pdkByContract(league: LeagueView, dunkest: DunkestView | null): Record<number, number> {
  if (!dunkest?.available) return {};
  const out: Record<number, number> = {};
  for (const t of league.teams) {
    for (const p of [...t.starters, ...t.reserves]) {
      const s = dunkest.stats.get(p.playerId);
      if (s) out[p.id] = s.pdk;
    }
  }
  return out;
}

/**
 * Scambi: simulatore (trade machine, da cui una squadra propone), con `?vista=cerca` il cercatore (Fase 7.4) e con
 * `?vista=proposte` le proposte della tua squadra (Fase 7.3). `?controproposta=<id>` apre il simulatore già compilato con una
 * proposta aperta in cui la tua squadra è dentro; `?squadre=a,b&mosse=…` con uno scambio scelto nel cercatore.
 */
export default async function TradePage(props: PageProps<"/scambio">) {
  const sp = await props.searchParams;
  const vista = one(sp.vista);
  const view = vista === "proposte" ? "proposals" : vista === "cerca" ? "finder" : "machine";
  const [league, versions, profile, market, proposals, dunkest] = await Promise.all([
    loadLeague(),
    loadVersions(),
    loadProfile(),
    loadTradeMarket(),
    loadProposals(),
    // il PDK serve solo al cercatore (equilibrio degli scambi)
    view === "finder" ? loadDunkest() : null,
  ]);
  const teams = simTeams(league, versions);
  const myTeamId = profile?.team_id ?? null;
  const admin = profile?.role === "admin";
  const list = proposals ?? [];
  const badges = proposalBadges(list, myTeamId, admin);

  // Controproposta (o proposta rifatta da chi l'ha mandata): solo da una proposta aperta della tua squadra; i movimenti che
  // non valgono più restano fuori dalla bozza.
  const counterId = Number(one(sp.controproposta));
  const parent = list.find((p) => p.id === counterId && isOpen(p) && !!myTeamId && (awaitsAnswer(p, myTeamId) || p.proposerTeamId === myTeamId));
  // «Usa questa» del cercatore: `?squadre=a,b&mosse=c12,p5` (Fase 7.4).
  const fromFinder = decodeMoves(teams, (one(sp.squadre) ?? "").split(","), one(sp.mosse) ?? "");
  const start: StartDraft | undefined = parent
    ? {
        teams: parent.teams,
        moves: parent.moves.filter((m) => !staleMoves(teams, [m]).length).map(({ kind, id, version, from, to, slot }) => ({ kind, id, version, from, to, ...(slot ? { slot } : {}) })),
        counter: { id: parent.id, own: parent.proposerTeamId === myTeamId },
      }
    : fromFinder
      ? { teams: (one(sp.squadre) ?? "").split(","), moves: fromFinder }
      : undefined;

  return (
    <>
      <PageTitle
        icon="swap"
        eyebrow={view === "proposals" ? "Scambi · proposte" : view === "finder" ? "Scambi · cercatore" : "Trade machine"}
        sub={
          view === "proposals"
            ? `Le proposte della tua squadra: le altre squadre hanno ${league.settings.tradeProposalHours} ore per rispondere, poi un admin esegue lo scambio. Le vedono solo le squadre coinvolte e gli admin.`
            : view === "finder"
              ? "Dimmi cosa cerchi: provo gli scambi a due squadre in regola e senza sforare il cap, poi ne scegli uno e lo ritocchi nel simulatore."
              : `Simula uno scambio anche a più squadre (fino a ${league.settings.tradeMaxTeams}): controlla cap e massimi di rosa di ogni squadra, le pick non incidono sul cap. Con il mercato aperto puoi proporlo alle altre squadre.`
        }
        // Stato del mercato deciso da un admin (Fase 7.1); il simulatore funziona in entrambi i casi.
        aside={market === null ? undefined : <Scoreboard items={[{ label: "Mercato", value: market ? "Aperto" : "Chiuso", tone: market ? "gold" : undefined }]} />}
      >
        {view === "proposals" ? "Proposte di scambio" : view === "finder" ? "Cercatore di scambi" : "Simulatore di scambio"}
      </PageTitle>

      <div className="mb-5">
        <ViewSwitch
          label="Vista"
          options={[
            { href: "/scambio", label: "Simulatore", hint: "prepara e proponi uno scambio", icon: "swap", active: view === "machine" },
            { href: "/scambio?vista=cerca", label: "Cerca", hint: "trova scambi per ciò che ti serve", icon: "search", active: view === "finder" },
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

      {view === "finder" ? (
        <TradeFinder teams={teams} settings={league.settings} myTeamId={myTeamId} pdk={pdkByContract(league, dunkest)} />
      ) : view === "proposals" ? (
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
          <TradeSimulator key={start ? (start.counter ? `p${start.counter.id}` : encodeMoves(start.moves)) : "new"} teams={teams} settings={league.settings} myTeamId={myTeamId} market={market} start={start} />
        </>
      )}
    </>
  );
}
