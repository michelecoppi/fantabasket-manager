// Rivalità (Fase 6.3): testa a testa tra le squadre negli scontri su Dunkest. Contano solo le giornate giocate (come
// `teamForm`: l'ultima con punti può essere in corso) e solo la stagione corrente. Puro e testato.
import type { DunkestLeagueView, LeagueMatch } from "./dunkest-league";

/** Sfide minime con la stessa avversaria per dare un badge: con una sola sfida «bestia nera» non vuol dire niente. */
export const RIVALRY_MIN_MEETINGS = 2;

export type Outcome = "W" | "D" | "L";

export interface Meeting {
  matchday: number;
  match: LeagueMatch;
  /** dal punto di vista della squadra richiesta */
  outcome: Outcome;
  pointsFor: number;
  pointsAgainst: number;
}

export interface HeadToHead {
  opponentId: string;
  meetings: Meeting[];
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  /** prossima sfida in calendario (giornata `latest` o da giocare), null se non ce n'è */
  next: number | null;
}

/** Sfide giocate tra due squadre, dalla più vecchia, viste da `teamId`. `before`: solo le giornate precedenti a questa. */
export function meetings(view: DunkestLeagueView, teamId: string, opponentId: string, before?: number): Meeting[] {
  const out: Meeting[] = [];
  for (const d of view.matchdays) {
    if (d.state !== "played" || (before !== undefined && d.matchday >= before)) continue;
    for (const m of d.matches) {
      const home = m.homeTeamId === teamId && m.awayTeamId === opponentId;
      const away = m.awayTeamId === teamId && m.homeTeamId === opponentId;
      if ((!home && !away) || m.homePts === null || m.awayPts === null) continue;
      out.push({
        matchday: d.matchday,
        match: m,
        outcome: m.winnerTeamId === null ? "D" : m.winnerTeamId === teamId ? "W" : "L",
        pointsFor: home ? m.homePts : m.awayPts,
        pointsAgainst: home ? m.awayPts : m.homePts,
      });
    }
  }
  return out;
}

/** Una riga per ogni altra squadra della classifica (anche mai affrontata), nell'ordine della classifica. */
export function headToHead(view: DunkestLeagueView, teamId: string): HeadToHead[] {
  const others = view.standings.map((s) => s.teamId).filter((id) => id !== teamId);
  return others.map((opponentId) => {
    const list = meetings(view, teamId, opponentId);
    const next = view.matchdays.find(
      (d) => d.state !== "played" && d.matches.some((m) => (m.homeTeamId === teamId && m.awayTeamId === opponentId) || (m.awayTeamId === teamId && m.homeTeamId === opponentId)),
    );
    return {
      opponentId,
      meetings: list,
      wins: list.filter((m) => m.outcome === "W").length,
      draws: list.filter((m) => m.outcome === "D").length,
      losses: list.filter((m) => m.outcome === "L").length,
      pointsFor: list.reduce((n, m) => n + m.pointsFor, 0),
      pointsAgainst: list.reduce((n, m) => n + m.pointsAgainst, 0),
      next: next?.matchday ?? null,
    };
  });
}

/**
 * Bestia nera: l'avversaria contro cui si è perso di più (a pari sconfitte la differenza punti peggiore); vittima preferita:
 * quella battuta di più (a pari vittorie la differenza punti migliore). Solo da RIVALRY_MIN_MEETINGS sfide in su, e serve
 * almeno una sconfitta (o vittoria). Un pareggio esatto su entrambi i criteri non dà badge: non si sceglie a caso.
 */
export function rivalryBadges(rows: HeadToHead[]): { nemesis: HeadToHead | null; victim: HeadToHead | null } {
  const eligible = rows.filter((r) => r.meetings.length >= RIVALRY_MIN_MEETINGS);
  const diff = (r: HeadToHead) => Math.round((r.pointsFor - r.pointsAgainst) * 100);
  const top = (list: HeadToHead[], cmp: (a: HeadToHead, b: HeadToHead) => number) => {
    const sorted = [...list].sort(cmp);
    return sorted.length > 0 && (sorted.length === 1 || cmp(sorted[0], sorted[1]) !== 0) ? sorted[0] : null;
  };
  return {
    nemesis: top(
      eligible.filter((r) => r.losses > 0),
      (a, b) => b.losses - a.losses || diff(a) - diff(b),
    ),
    victim: top(
      eligible.filter((r) => r.wins > 0),
      (a, b) => b.wins - a.wins || diff(b) - diff(a),
    ),
  };
}

/** Bilancio dei precedenti tra due squadre, per la riga sotto uno scontro. */
export function precedents(view: DunkestLeagueView, homeId: string, awayId: string, before: number): { played: number; homeWins: number; awayWins: number; draws: number } {
  const list = meetings(view, homeId, awayId, before);
  return {
    played: list.length,
    homeWins: list.filter((m) => m.outcome === "W").length,
    awayWins: list.filter((m) => m.outcome === "L").length,
    draws: list.filter((m) => m.outcome === "D").length,
  };
}
