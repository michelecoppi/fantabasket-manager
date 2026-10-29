// Andamento in classifica (Fase 6.4): la classifica ricostruita giornata per giornata dagli scontri giocati, ordinata come
// Dunkest (vittorie, poi punti totali; verificato sulla classifica del 2026-10-29). Puro e testato.
import type { DunkestLeagueView, Standing } from "./dunkest-league";

/**
 * ASSUNZIONE (OPEN-QUESTIONS, Fase 6): un pareggio vale mezza vittoria nell'ordine della classifica. Finora nessun pareggio:
 * se Dunkest li conta diversamente, il controllo `checkOfficial` lo scopre e la pagina non mostra il grafico.
 */
export const DRAW_WEIGHT = 0.5;

export interface HistoryRow {
  teamId: string;
  position: number;
  wins: number;
  draws: number;
  losses: number;
  totalPts: number;
}

export interface HistoryPoint {
  matchday: number;
  /** ordinate per posizione */
  rows: HistoryRow[];
}

const score = (r: HistoryRow) => r.wins + r.draws * DRAW_WEIGHT;
const cents = (n: number) => Math.round(n * 100);

/**
 * Classifica dopo ogni giornata giocata (stato `played`; la `latest` può essere in corso). Le squadre sono quelle della
 * classifica ufficiale più chi compare negli scontri. A pari vittorie e punti totali la posizione è condivisa.
 */
export function standingsByMatchday(view: DunkestLeagueView): HistoryPoint[] {
  const teams = new Set(view.standings.map((s) => s.teamId));
  for (const d of view.matchdays) for (const m of d.matches) teams.add(m.homeTeamId).add(m.awayTeamId);
  const acc = new Map<string, HistoryRow>([...teams].map((id) => [id, { teamId: id, position: 0, wins: 0, draws: 0, losses: 0, totalPts: 0 }]));
  const out: HistoryPoint[] = [];
  for (const d of view.matchdays) {
    if (d.state !== "played") continue;
    for (const m of d.matches) {
      if (m.homePts === null || m.awayPts === null) continue;
      const home = acc.get(m.homeTeamId)!;
      const away = acc.get(m.awayTeamId)!;
      home.totalPts += m.homePts;
      away.totalPts += m.awayPts;
      if (m.winnerTeamId === null) {
        home.draws++;
        away.draws++;
      } else {
        const [w, l] = m.winnerTeamId === m.homeTeamId ? [home, away] : [away, home];
        w.wins++;
        l.losses++;
      }
    }
    const sorted = [...acc.values()].map((r) => ({ ...r })).sort((a, b) => score(b) - score(a) || cents(b.totalPts) - cents(a.totalPts) || a.teamId.localeCompare(b.teamId));
    sorted.forEach((r, i) => {
      const prev = sorted[i - 1];
      r.position = prev && score(prev) === score(r) && cents(prev.totalPts) === cents(r.totalPts) ? prev.position : i + 1;
    });
    out.push({ matchday: d.matchday, rows: sorted });
  }
  return out;
}

/**
 * Confronto con la classifica ufficiale: "ok" se la ricostruzione con le stesse partite giocate dà le stesse posizioni,
 * "mismatch" se no (regole diverse da quelle assunte: la pagina lo dice invece di mostrare un grafico sbagliato), "pending"
 * se la classifica ufficiale conta partite che la ricostruzione non ha ancora (giornata in corso).
 */
export function checkOfficial(history: HistoryPoint[], standings: Standing[]): "ok" | "mismatch" | "pending" {
  if (standings.length === 0) return "pending";
  const games = (r: { wins: number; draws: number; losses: number }) => r.wins + r.draws + r.losses;
  const official = new Map(standings.map((s) => [s.teamId, s]));
  const point = [...history].reverse().find((h) => h.rows.every((r) => !official.has(r.teamId) || games(official.get(r.teamId)!) === games(r)));
  if (!point) return history.length === 0 && standings.every((s) => games(s) === 0) ? "ok" : "pending";
  return point.rows.every((r) => {
    const o = official.get(r.teamId);
    return !o || (o.position === r.position && o.wins === r.wins && o.draws === r.draws && o.losses === r.losses);
  })
    ? "ok"
    : "mismatch";
}

/** Posizioni di una squadra dopo ogni giornata (per la sparkline della pagina squadra). */
export function teamPositions(history: HistoryPoint[], teamId: string): { matchday: number; position: number }[] {
  return history.flatMap((h) => {
    const r = h.rows.find((x) => x.teamId === teamId);
    return r ? [{ matchday: h.matchday, position: r.position }] : [];
  });
}
