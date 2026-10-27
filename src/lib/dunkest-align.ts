// Allineamento di titolari e riserve alla rosa Dunkest (issue #72) per una squadra della vista di lega: lo usano la pagina
// /admin/dunkest (proposta) e l'action che lo applica, così calcolano la stessa cosa.
import { rosterAlignment, rosterRefs, type Alignment, type DunkestRosterPlayer } from "./dunkest-league";
import type { LeagueView } from "./league";

export function teamAlignment(league: LeagueView, teamId: string, rosters: Map<string, DunkestRosterPlayer[]>): Alignment | null {
  const t = league.teams.find((x) => x.team.id === teamId);
  const dunkest = rosters.get(teamId);
  if (!t || !dunkest) return null;
  return rosterAlignment(
    teamId,
    {
      contracts: [...t.starters, ...t.reserves].map((p) => ({ contractId: p.id, playerId: p.playerId, name: p.name, pos: p.pos, slot: p.slot, salary: p.salary })),
      cuts: t.cuts.map((c) => ({ salary: c.paid })),
      bonus: t.bonus,
    },
    dunkest,
    rosterRefs(league.teams),
    (id) => league.teamNames.get(id) ?? "?",
    league.settings,
  );
}
