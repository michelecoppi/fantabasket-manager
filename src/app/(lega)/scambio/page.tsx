import { PageTitle } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";
import { TradeSimulator, type SimTeam } from "./simulator";

export default async function TradePage() {
  const league = await loadLeague();
  const teams: SimTeam[] = league.teams.map((t) => ({
    id: t.team.id,
    name: t.team.name,
    bonus: t.bonus,
    cuts: t.cuts.map((c) => ({ salary: c.paid })),
    players: [...t.starters, ...t.reserves].map((p) => ({ id: p.id, name: p.name, pos: p.pos, slot: p.slot, salary: p.salary })),
    picks: league.picks
      .filter((p) => p.current_team_id === t.team.id)
      .map((p) => ({
        id: p.id,
        label: `${p.year} · ${p.round}° giro${p.original_team_id !== t.team.id ? ` (di ${league.teamNames.get(p.original_team_id) ?? "?"})` : ""}${p.to_confirm ? " · da confermare" : ""}`,
      })),
  }));
  return (
    <>
      <PageTitle sub="Simulazione in sola lettura: non salva nulla. Controlla il cap di entrambe le squadre (R-57); le pick non incidono sul cap.">
        Simulatore di scambio
      </PageTitle>
      <TradeSimulator teams={teams} settings={league.settings} />
    </>
  );
}
