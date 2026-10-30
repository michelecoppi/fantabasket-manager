import type { SimTeam } from "./trade-draft";
import { playerName, type LeagueView, type Versions } from "./league";

/** Squadre nella forma che usano simulatore e scambio admin; con `versions` ogni riga porta la versione vista (concorrenza, migrazione 0006). */
export function simTeams(league: LeagueView, versions?: Pick<Versions, "contracts" | "picks"> & Partial<Pick<Versions, "talents">>): SimTeam[] {
  return league.teams.map((t) => ({
    id: t.team.id,
    name: t.team.name,
    bonus: t.bonus,
    cuts: t.cuts.map((c) => ({ salary: c.paid })),
    players: [...t.starters, ...t.reserves].map((p) => ({
      id: p.id,
      name: p.name,
      pos: p.pos,
      slot: p.slot,
      salary: p.salary,
      version: versions?.contracts[p.id],
    })),
    picks: league.picks
      .filter((p) => p.current_team_id === t.team.id)
      .map((p) => ({
        id: p.id,
        year: p.year,
        round: p.round,
        toConfirm: p.to_confirm,
        version: versions?.picks[p.id],
        label: `${p.year} · ${p.round}° giro${p.original_team_id !== t.team.id ? ` (di ${league.teamNames.get(p.original_team_id) ?? "?"})` : ""}${p.to_confirm ? " · da confermare" : ""}`,
      })),
    // R-56/R-35 (7.6): i talenti si scambiano; il nome è quello del giocatore collegato al listone, se c'è.
    talents: t.talents.map((x) => ({
      id: x.id,
      name: x.players ? playerName(x.players) : x.display_name,
      draftYear: x.draft_year,
      credits: x.entry_credits === null ? null : Number(x.entry_credits),
      nbaTeam: x.players?.nba_team ?? null,
      version: versions?.talents?.[x.id],
    })),
  }));
}
