"use server";

import { loadLeague, loadPlayers } from "@/lib/league-server";
import type { SearchIndex } from "@/lib/search";

/**
 * Indice della ricerca globale (header): squadre e listone, letti come l'utente (RLS), solo i campi che servono ai risultati.
 * Lo chiede il browser la prima volta che apre la ricerca, così le pagine non si portano dietro ~600 giocatori.
 */
export async function loadSearchIndex(): Promise<SearchIndex> {
  const [league, players] = await Promise.all([loadLeague(), loadPlayers()]);
  return {
    teams: league.teams.map((t) => ({ id: t.team.id, name: t.team.name, owner: t.team.owner_name })),
    players: players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, nbaTeam: p.nbaTeam, ownerTeamId: p.ownerTeamId, credits: p.credits })),
  };
}
