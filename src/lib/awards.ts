// Premi della giornata (Fase 6.1): solo dai punti che dà Dunkest, mai ricostruendo il punteggio di squadra (il 2026-10-29
// il punteggio di uno scontro non è la somma dei 10 schierati: capitano e panchina hanno regole che non abbiamo). Puro e testato.
import type { LeagueMatch, LineupPlayer } from "./dunkest-league";

export type AwardKind =
  | "mvp"
  | "captain_best"
  | "captain_worst"
  | "sixth_man"
  | "bench"
  | "team_best"
  | "team_worst"
  | "blowout"
  | "photo_finish";

export interface AwardWinner {
  teamId: string;
  /** giocatore (premi individuali), come scritto nella formazione */
  name?: string;
  playerId?: number | null;
  /** punti del giocatore o della squadra, margine per gli scontri */
  value: number;
  /** avversaria (premi di scontro) */
  vsTeamId?: string;
}

export interface Award {
  kind: AwardKind;
  /** più vincitori = stesso valore, premio condiviso */
  winners: AwardWinner[];
}

/** Ordine di presentazione: prima i giocatori, poi squadre e scontri. */
export const AWARD_ORDER: AwardKind[] = ["mvp", "captain_best", "sixth_man", "bench", "captain_worst", "team_best", "team_worst", "blowout", "photo_finish"];

// I punti Dunkest hanno due decimali: confronto sui centesimi per non separare due valori uguali per un errore di virgola mobile.
const cents = (n: number) => Math.round(n * 100);

/** Tutti quelli col valore più alto (`best`) o più basso; lista vuota se non ce n'è nessuno. */
function pick<T>(items: T[], value: (x: T) => number, best: boolean): T[] {
  if (items.length === 0) return [];
  const target = items.reduce((acc, x) => (best ? Math.max(acc, cents(value(x))) : Math.min(acc, cents(value(x)))), best ? -Infinity : Infinity);
  return items.filter((x) => cents(value(x)) === target);
}

/** Scontro con punti veri: una giornata appena iniziata arriva come 0,00–0,00 e non dice niente. */
const scored = (m: LeagueMatch): m is LeagueMatch & { homePts: number; awayPts: number } =>
  m.homePts !== null && m.awayPts !== null && !(m.homePts === 0 && m.awayPts === 0);

/**
 * Premi di una giornata. I premi dei giocatori servono le formazioni (`lineups`: scontro → squadra → giocatori), quelli di
 * squadra e di scontro solo i punteggi: una giornata senza formazioni salvate ha comunque i secondi. Giocatori con punti null
 * esclusi; giocatori non collegati ammessi (il nome viene dalla formazione). A parità di valore il premio è condiviso.
 */
export function matchdayAwards(matches: LeagueMatch[], lineups: Map<number, Map<string, LineupPlayer[]>>): Award[] {
  const players = matches.flatMap((m) =>
    [...(lineups.get(m.id) ?? new Map<string, LineupPlayer[]>()).entries()].flatMap(([teamId, list]) =>
      list.filter((p): p is LineupPlayer & { pts: number } => p.pts !== null).map((p) => ({ teamId, p })),
    ),
  );
  const player = (x: { teamId: string; p: LineupPlayer & { pts: number } }): AwardWinner => ({ teamId: x.teamId, name: x.p.name, playerId: x.p.playerId, value: x.p.pts });
  const captains = players.filter((x) => x.p.isCaptain);
  const sides = matches.filter(scored).flatMap((m) => [
    { teamId: m.homeTeamId, value: m.homePts, vsTeamId: m.awayTeamId },
    { teamId: m.awayTeamId, value: m.awayPts, vsTeamId: m.homeTeamId },
  ]);
  const games = matches.filter(scored).map((m) => {
    const homeAhead = m.homePts >= m.awayPts;
    return { teamId: homeAhead ? m.homeTeamId : m.awayTeamId, vsTeamId: homeAhead ? m.awayTeamId : m.homeTeamId, value: Math.abs(m.homePts - m.awayPts) };
  });

  const out: Award[] = [
    { kind: "mvp", winners: pick(players, (x) => x.p.pts, true).map(player) },
    { kind: "captain_best", winners: pick(captains, (x) => x.p.pts, true).map(player) },
    { kind: "sixth_man", winners: pick(players.filter((x) => x.p.isSixthMan), (x) => x.p.pts, true).map(player) },
    { kind: "bench", winners: pick(players.filter((x) => x.p.role === "bench" && !x.p.isSixthMan), (x) => x.p.pts, true).map(player) },
    // con un solo capitano il migliore e il peggiore coincidono: niente premio al contrario
    { kind: "captain_worst", winners: captains.length > 1 ? pick(captains, (x) => x.p.pts, false).map(player) : [] },
    { kind: "team_best", winners: pick(sides, (s) => s.value, true) },
    { kind: "team_worst", winners: sides.length > 1 ? pick(sides, (s) => s.value, false) : [] },
    { kind: "blowout", winners: pick(games, (g) => g.value, true) },
    { kind: "photo_finish", winners: games.length > 1 ? pick(games, (g) => g.value, false) : [] },
  ];
  return out.filter((a) => a.winners.length > 0);
}

/** true se la giornata ha almeno un premio di giocatore (cioè formazioni salvate con punti). */
export const hasPlayerAwards = (awards: Award[]) => awards.some((a) => a.winners.some((w) => w.name !== undefined));

// ---------- Vetrina stagionale ----------

/** Premi «al contrario»: nella vetrina stanno su una mensola a parte e non si sommano ai trofei (decisione dell'utente). */
export const SHAME_KINDS: AwardKind[] = ["captain_worst", "team_worst"];
export const TROPHY_KINDS: AwardKind[] = AWARD_ORDER.filter((k) => !SHAME_KINDS.includes(k));

export interface TrophyWin extends AwardWinner {
  kind: AwardKind;
  matchday: number;
}

export interface TrophyCase {
  teamId: string;
  trophies: TrophyWin[];
  shame: TrophyWin[];
  /** posizione per numero di trofei (1 = più trofei; a pari numero posizione condivisa) */
  rank: number;
}

export interface SeasonTrophies {
  /** giornate chiuse contate (stato `played`: l'ultima con punti può essere in corso e resta fuori) */
  matchdays: number[];
  /** di queste, quelle senza formazioni salvate: hanno solo i premi di squadra e di scontro */
  withoutLineups: number[];
  teams: Map<string, TrophyCase>;
}

/**
 * Vetrina della stagione: i premi di tutte le giornate chiuse, per squadra. Un premio condiviso vale per ogni vincitore; nei
 * premi di scontro (goleada, fotofinish) il trofeo va a chi ha vinto lo scontro. `teamIds`: tutte le squadre, anche senza trofei.
 */
export function seasonTrophies(
  matchdays: { matchday: number; state: string; matches: LeagueMatch[] }[],
  lineups: Map<number, Map<string, LineupPlayer[]>>,
  teamIds: string[],
): SeasonTrophies {
  const cases = new Map<string, TrophyCase>(teamIds.map((id) => [id, { teamId: id, trophies: [], shame: [], rank: 0 }]));
  const closed = matchdays.filter((d) => d.state === "played").sort((a, b) => a.matchday - b.matchday);
  const withoutLineups: number[] = [];
  for (const d of closed) {
    const awards = matchdayAwards(d.matches, lineups);
    if (!hasPlayerAwards(awards)) withoutLineups.push(d.matchday);
    for (const a of awards) {
      for (const w of a.winners) {
        const c = cases.get(w.teamId) ?? { teamId: w.teamId, trophies: [], shame: [], rank: 0 };
        cases.set(w.teamId, c);
        (SHAME_KINDS.includes(a.kind) ? c.shame : c.trophies).push({ ...w, kind: a.kind, matchday: d.matchday });
      }
    }
  }
  const sorted = [...cases.values()].sort((a, b) => b.trophies.length - a.trophies.length);
  sorted.forEach((c, i) => {
    const prev = sorted[i - 1];
    c.rank = prev && prev.trophies.length === c.trophies.length ? prev.rank : i + 1;
  });
  return { matchdays: closed.map((d) => d.matchday), withoutLineups, teams: cases };
}
