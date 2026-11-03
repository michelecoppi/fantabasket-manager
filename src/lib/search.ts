/*
 * Ricerca globale (header): squadre della lega e giocatori del listone per nome, ignorando accenti, maiuscole e punteggiatura.
 * Pura e testata; l'indice lo prepara il server la prima volta che si apre la ricerca.
 */

export interface SearchTeam {
  id: string;
  name: string;
  owner: string | null;
}

export interface SearchPlayer {
  id: number;
  name: string;
  pos: string | null;
  nbaTeam: string | null;
  /** Squadra della lega che lo ha in rosa. */
  ownerTeamId: string | null;
  credits: number | null;
}

export interface SearchIndex {
  teams: SearchTeam[];
  players: SearchPlayer[];
}

export type SearchHit = { kind: "team"; team: SearchTeam } | { kind: "player"; player: SearchPlayer };

/** Minuscole senza accenti, la punteggiatura diventa spazio: "Dončić Jr." → "doncic jr". */
export const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Punteggio di un testo per la query (parole già normalizzate): ogni parola deve comparire. 2 se ogni parola è l'inizio di una
 * parola del testo («jok» per «Nikola Jokić»), 1 se compare solo in mezzo, 0 se manca.
 */
function score(text: string, words: string[]): number {
  const n = ` ${normalize(text)}`;
  let best = 2;
  for (const w of words) {
    if (n.includes(` ${w}`)) continue;
    if (n.includes(w)) best = 1;
    else return 0;
  }
  return best;
}

/** Al massimo `limit` risultati: prima le squadre (nome o proprietario), poi i giocatori; a parità chi vale più crediti. */
export function searchLeague(index: SearchIndex, query: string, limit = 12): SearchHit[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const teams = index.teams
    .map((team) => ({ team, s: Math.max(score(team.name, words), team.owner ? score(team.owner, words) : 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.team.name.localeCompare(b.team.name))
    .map(({ team }): SearchHit => ({ kind: "team", team }));
  const players = index.players
    .map((player) => ({ player, s: score(player.name, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.player.credits ?? -1) - (a.player.credits ?? -1) || a.player.name.localeCompare(b.player.name))
    .map(({ player }): SearchHit => ({ kind: "player", player }));
  return [...teams, ...players].slice(0, limit);
}
