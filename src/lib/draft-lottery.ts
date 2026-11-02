// Sorteggio dell'ordine del draft (R-32, issue #103). Pura e testata: chi partecipa e con quanti biglietti, probabilità, ordine
// finale e verifica dell'estrazione. L'estrazione vera la fa la RPC `admin_draw_lottery` nel database (seme casuale lato server,
// una volta sola per stagione); qui la stessa procedura serve a mostrarla e a rifarla nel browser per verificarla.
//
// Procedura (decisa dall'utente il 2026-11-02): si estrae la 1ª scelta tra le ultime `lotteryTeams` squadre con i biglietti di
// `lotteryWeights` (8ª in classifica 4, 7ª 3, 6ª 2, 5ª 1); chi esce prende la scelta e le altre restano in gara con gli stessi
// biglietti, finché l'ultima rimasta prende l'ultima scelta della lottery. Le altre squadre scelgono in ordine inverso di
// classifica. Una classifica sola, quella della regular season (domanda 7). Lo stesso ordine vale per tutti i giri (R-31).
import type { LeagueSettings } from "./cap";

export interface LotteryEntrant {
  teamId: string;
  /** posizione nella classifica finale (1 = prima) */
  rank: number;
  weight: number;
}

/** Un'estrazione: `roll` è il biglietto uscito contando da 0 su `total`; null = ultima rimasta, nessuna estrazione. */
export interface LotteryDraw {
  pick: number;
  teamId: string;
  roll: number | null;
  total: number;
}

/** Sorteggio salvato (tabella `draft_lotteries`). `entrants` e `weights` vanno dalla peggiore della classifica in su. */
export interface LotteryRecord {
  seasonId: number;
  draftYear: number;
  ranking: string[];
  entrants: string[];
  weights: number[];
  seed: string;
  draws: LotteryDraw[];
  drawnAt: string;
  drawnBy: string;
}

/** Squadre della lottery con i loro biglietti, dalla peggiore della classifica (R-32). */
export function lotteryEntrants(ranking: string[], s: Pick<LeagueSettings, "lotteryTeams" | "lotteryWeights">): { entrants: LotteryEntrant[]; errors: string[] } {
  const n = ranking.length;
  const m = s.lotteryTeams;
  const errors: string[] = [];
  if (!Number.isInteger(m) || m < 1 || m > n) errors.push(`lottery_teams non valido (${m}).`);
  else if (s.lotteryWeights.length !== m) errors.push(`I biglietti della lottery (lottery_weight_*) sono ${s.lotteryWeights.length} ma le squadre in gara ${m}: correggi league_settings.`);
  else if (!s.lotteryWeights.every((w) => Number.isInteger(w) && w >= 1)) errors.push("Ogni squadra della lottery deve avere almeno un biglietto (lottery_weight_*).");
  if (new Set(ranking).size !== n || ranking.some((t) => !t)) errors.push("Completa la classifica: ogni squadra in una sola posizione.");
  if (errors.length) return { entrants: [], errors };
  return { entrants: s.lotteryWeights.map((weight, i) => ({ teamId: ranking[n - 1 - i], rank: n - i, weight })), errors };
}

/** Biglietti di ogni squadra ancora in gara, numerati da 1 nell'ordine delle squadre (dalla peggiore). */
export function ticketRanges(remaining: LotteryEntrant[]): { teamId: string; from: number; to: number }[] {
  let next = 1;
  return remaining.map((e) => {
    const from = next;
    next += e.weight;
    return { teamId: e.teamId, from, to: next - 1 };
  });
}

/** Chi possiede il biglietto `roll` (da 0) tra le squadre rimaste. */
export function pickByRoll(remaining: LotteryEntrant[], roll: number): LotteryEntrant {
  let acc = 0;
  for (const e of remaining) {
    acc += e.weight;
    if (roll < acc) return e;
  }
  throw new Error(`Biglietto ${roll} fuori dai ${acc} in gara`);
}

/** Numero dell'estrazione `step` (da 1): i primi 4 byte dello SHA-256 di "<seme>:<step>", modulo i biglietti in gara. */
export const lotteryMessage = (seed: string, step: number) => `${seed}:${step}`;
export function rollFromDigest(digest: Uint8Array, total: number): number {
  const n = ((digest[0] << 24) >>> 0) + (digest[1] << 16) + (digest[2] << 8) + digest[3];
  return n % total;
}

export type Sha256 = (text: string) => Promise<Uint8Array>;
/** SHA-256 di Web Crypto: c'è nel browser (pagine sicure, anche localhost) e in Node. */
export const webSha256: Sha256 = async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/** Rifà il sorteggio dal seme, come `lottery_draw` nel database: un'estrazione per scelta, l'ultima rimasta senza estrazione. */
export async function drawLottery(seed: string, entrants: LotteryEntrant[], sha256: Sha256 = webSha256): Promise<LotteryDraw[]> {
  let remaining = [...entrants];
  const draws: LotteryDraw[] = [];
  for (let pick = 1; remaining.length > 0; pick++) {
    const total = remaining.reduce((sum, e) => sum + e.weight, 0);
    const roll = remaining.length === 1 ? null : rollFromDigest(await sha256(lotteryMessage(seed, pick)), total);
    const winner = roll === null ? remaining[0] : pickByRoll(remaining, roll);
    draws.push({ pick, teamId: winner.teamId, roll, total });
    remaining = remaining.filter((e) => e !== winner);
  }
  return draws;
}

/** Entranti di un sorteggio salvato, con la posizione in classifica letta dalla classifica salvata. */
export function recordEntrants(r: Pick<LotteryRecord, "ranking" | "entrants" | "weights">): LotteryEntrant[] {
  return r.entrants.map((teamId, i) => ({ teamId, rank: r.ranking.indexOf(teamId) + 1, weight: r.weights[i] ?? 0 }));
}

/** Rifà il sorteggio dal seme salvato e lo confronta con quello registrato. */
export async function verifyLottery(r: LotteryRecord, sha256: Sha256 = webSha256): Promise<boolean> {
  const again = await drawLottery(r.seed, recordEntrants(r), sha256);
  return again.length === r.draws.length && again.every((d, i) => d.teamId === r.draws[i].teamId && d.roll === r.draws[i].roll && d.total === r.draws[i].total);
}

/**
 * Probabilità esatte: `odds[i][k]` = probabilità che l'entrante i prenda la scelta k+1 (estrazione senza reinserimento con
 * gli stessi biglietti). Con poche squadre si contano tutti i casi.
 */
export function lotteryOdds(entrants: LotteryEntrant[]): number[][] {
  const m = entrants.length;
  const odds = entrants.map(() => Array<number>(m).fill(0));
  const walk = (left: number[], pick: number, p: number) => {
    const total = left.reduce((sum, i) => sum + entrants[i].weight, 0);
    for (const i of left) {
      const q = p * (left.length === 1 ? 1 : entrants[i].weight / total);
      odds[i][pick] += q;
      if (left.length > 1) walk(left.filter((j) => j !== i), pick + 1, q);
    }
  };
  if (m > 0) walk(entrants.map((_, i) => i), 0, 1);
  return odds;
}

/** Ordine di un giro (squadre di origine): prima le uscite dalla lottery, poi le altre in ordine inverso di classifica (R-32). */
export function draftRoundOrder(ranking: string[], lottery: string[]): string[] {
  return [...lottery, ...ranking.slice(0, ranking.length - lottery.length).reverse()];
}

/** Numeri assoluti delle scelte di chi sceglie per `slot`-esimo (da 1) in ogni giro: 1ª con 8 squadre → 1, 9, 17, 25, 33 (R-31). */
export const pickNumbers = (slot: number, teams: number, rounds: number) => Array.from({ length: rounds }, (_, r) => r * teams + slot);

/** Posizione nell'ordine senza lottery (la peggiore sceglie per prima): serve a dire di quanto una squadra è salita o scesa. */
export const slotWithoutLottery = (rank: number, teams: number) => teams - rank + 1;

/** Una pick del draft del sorteggio: di chi era e di chi è adesso (gli scambi di pick si vedono). */
export interface BoardPick {
  year: number;
  round: number;
  originalTeamId: string;
  currentTeamId: string | null;
}

/** Un posto del 1° giro come lo mostrano la rivelazione e la pagina del draft. */
export interface BoardSlot {
  pick: number;
  /** squadra di origine della scelta */
  teamId: string;
  rank: number;
  lottery: boolean;
  /** biglietti (solo lottery) */
  weight: number | null;
  /** probabilità che le toccasse proprio questa scelta (solo lottery) */
  chance: number | null;
  /** posti guadagnati (+) o persi (−) rispetto all'ordine senza lottery */
  move: number;
  /** numeri assoluti delle sue scelte in ogni giro */
  numbers: number[];
  /** scelte di questo posto che oggi sono di un'altra squadra */
  traded: { round: number; number: number; ownerId: string }[];
  /** estrazione che gliel'ha data: `from`–`to` sono i suoi biglietti in quella estrazione (da 1) */
  draw: { step: number; roll: number | null; total: number; from: number; to: number } | null;
}

export interface LotteryBoard {
  slots: BoardSlot[];
  /** squadre della lottery dalla peggiore, con la probabilità di prendere la 1ª */
  entrants: (LotteryEntrant & { chanceFirst: number })[];
}

export function lotteryBoard(r: LotteryRecord, picks: BoardPick[], rounds: number): LotteryBoard {
  const n = r.ranking.length;
  const entrants = recordEntrants(r);
  const odds = lotteryOdds(entrants);
  const draws = [...r.draws].sort((a, b) => a.pick - b.pick);
  const order = draftRoundOrder(r.ranking, draws.map((d) => d.teamId));

  // Biglietti di ogni squadra nell'estrazione che le ha dato la scelta (le rimaste si rinumerano da 1).
  const drawOf = new Map<string, BoardSlot["draw"]>();
  let remaining = entrants;
  for (const d of draws) {
    const range = ticketRanges(remaining).find((t) => t.teamId === d.teamId);
    if (range) drawOf.set(d.teamId, { step: d.pick, roll: d.roll, total: d.total, from: range.from, to: range.to });
    remaining = remaining.filter((e) => e.teamId !== d.teamId);
  }

  const slots = order.map<BoardSlot>((teamId, i) => {
    const pick = i + 1;
    const rank = r.ranking.indexOf(teamId) + 1;
    const ei = entrants.findIndex((e) => e.teamId === teamId);
    const numbers = pickNumbers(pick, n, rounds);
    const traded = numbers.flatMap((number, ri) => {
      const p = picks.find((x) => x.year === r.draftYear && x.round === ri + 1 && x.originalTeamId === teamId);
      return p?.currentTeamId && p.currentTeamId !== teamId ? [{ round: ri + 1, number, ownerId: p.currentTeamId }] : [];
    });
    return {
      pick,
      teamId,
      rank,
      lottery: ei >= 0,
      weight: ei >= 0 ? entrants[ei].weight : null,
      chance: ei >= 0 ? odds[ei][pick - 1] ?? 0 : null,
      move: slotWithoutLottery(rank, n) - pick,
      numbers,
      traded,
      draw: drawOf.get(teamId) ?? null,
    };
  });
  return { slots, entrants: entrants.map((e, i) => ({ ...e, chanceFirst: odds[i][0] ?? 0 })) };
}

/** "40%", "6,7%": una cifra decimale sotto il 10%, così le probabilità piccole non sembrano zero. */
export function fmtChance(p: number): string {
  const pct = p * 100;
  const s = pct >= 10 || Number.isInteger(Math.round(pct * 10) / 10) ? String(Math.round(pct)) : (Math.round(pct * 10) / 10).toFixed(1).replace(".", ",");
  return `${s}%`;
}
