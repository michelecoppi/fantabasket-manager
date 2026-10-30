// Partite e giornate dei giocatori NBA su Dunkest: leader della notte, leader della giornata (settimana fantasy "M4") e
// andamento partita per partita. Tutto puro e testato; le richieste di rete stanno in dunkest-games-sync.ts, che gira solo
// nel job giornaliero (le pagine leggono dal database).
import type { Position } from "./cap";
import { num, POS, SourceFormatError, STATS_FILTERS } from "./dunkest";

// ---------- Fonti (stesso endpoint delle medie stagionali, verificato il 2026-10-30) ----------

const STATS = "https://www.dunkest.com/api/stats/table";

/** Una riga per giocatore che ha giocato in quel giorno (data americana). Una settimana intera non si può chiedere in una volta. */
export function dunkestDayUrl(dunkestSeasonId: number, day: string): string {
  return `${STATS}?season_id=${dunkestSeasonId}&mode=nba&stats_type=avg&date_from=${day}&date_to=${day}${STATS_FILTERS}`;
}

/**
 * Totali di un round: i round di una giornata fantasy (settimana Dunkest) sono finestre di partite che non coincidono col giorno
 * di calendario. Un round per richiesta: con più `rounds[]` insieme Dunkest risponde "DB error".
 */
export function dunkestRoundUrl(dunkestSeasonId: number, week: number, round: number): string {
  return `${STATS}?season_id=${dunkestSeasonId}&mode=dunkest&stats_type=tot&weeks[]=${week}&rounds[]=${round}${STATS_FILTERS}`;
}

/** Round provati per ogni giornata: finora al massimo 3, un round vuoto risponde `[]`. */
export const ROUNDS_PER_WEEK = 5;

export interface SourceGame {
  dunkestId: number;
  firstName: string;
  lastName: string;
  teamCode: string;
  pos: Position | null;
  gp: number;
  pdk: number;
  min: number;
  starter: boolean;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
}

/**
 * Righe di `/api/stats/table` per un giorno o un round. Lista vuota ammessa (giorno senza partite, round non ancora giocato).
 * Con `single` ogni riga deve essere una partita sola: se Dunkest mediasse due partite, il punteggio sarebbe sbagliato.
 */
export function parseGames(json: unknown, single: boolean): SourceGame[] {
  if (!Array.isArray(json)) throw new SourceFormatError("partite: la risposta non è una lista");
  const out = new Map<number, SourceGame>();
  for (const r of json as Record<string, unknown>[]) {
    const int = (v: unknown) => (Number.isFinite(num(v)) ? Math.round(num(v)) : 0);
    const g: SourceGame = {
      dunkestId: num(r?.id),
      firstName: String(r?.first_name ?? "").trim(),
      lastName: String(r?.last_name ?? "").trim(),
      teamCode: String(r?.team_code ?? "").trim(),
      pos: POS[String(r?.position ?? "").trim()] ?? null,
      gp: num(r?.gp),
      pdk: num(r?.pdk),
      min: Number.isFinite(num(r?.min)) ? num(r?.min) : 0,
      starter: num(r?.starter) === 1,
      pts: int(r?.pts),
      reb: int(r?.reb),
      ast: int(r?.ast),
      stl: int(r?.stl),
      blk: int(r?.blk),
      tov: int(r?.tov),
    };
    if (!Number.isInteger(g.dunkestId) || !g.lastName || !Number.isFinite(g.pdk) || !Number.isInteger(g.gp) || g.gp < 1) {
      throw new SourceFormatError(`partite: riga senza id, nome, gp o pdk (${JSON.stringify(r).slice(0, 120)})`);
    }
    if (single && g.gp !== 1) throw new SourceFormatError(`partite: ${g.lastName} ha gp ${g.gp}, attesa una partita sola (${JSON.stringify(r).slice(0, 80)})`);
    out.set(g.dunkestId, g);
  }
  return [...out.values()];
}

// ---------- Cosa leggere ----------

const DAY_MS = 86_400_000;
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Oggi nel fuso dell'NBA ("2026-10-30"): le date di Dunkest sono quelle americane, la notte italiana cade sul giorno prima. */
export function nbaToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

/** Primo giorno da cui cercare partite: l'NBA parte nella seconda metà di ottobre, i giorni vuoti prima costano solo una richiesta. */
export const seasonStartDay = (seasonYear: number): string => `${seasonYear}-10-15`;

/** Giorni riletti prima dell'ultimo già salvato: Dunkest corregge le statistiche a posteriori. */
export const GAME_DAYS_LOOKBACK = 2;
export const GAME_DAYS_MAX = 12;
export const WEEKS_MAX = 3;

/**
 * Giorni da leggere, dal più vecchio: dall'ultimo salvato (meno il margine di correzione) fino a oggi. Oltre `max` si ripartirà
 * dal prossimo giro: la lettura avanza dal più vecchio, quindi un recupero lungo si completa in più aggiornamenti.
 */
export function gameDaysToRead(lastDate: string | null, today: string, seasonStart: string, max = GAME_DAYS_MAX): string[] {
  const from = lastDate ? addDays(lastDate, -GAME_DAYS_LOOKBACK) : seasonStart;
  const days: string[] = [];
  for (let d = from < seasonStart ? seasonStart : from; d <= today && days.length < max; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Giornate da leggere: quella in corso e la precedente (correzioni) più quelle mai lette, le più vecchie per prime. La giornata
 * in corso c'è sempre; `null` = la lega non ha ancora giornate con punti.
 */
export function weeksToRead(current: number | null, stored: number[], max = WEEKS_MAX): number[] {
  if (current === null || current < 1) return [];
  const have = new Set(stored);
  const rest: number[] = [];
  for (let w = 1; w < current; w++) if (!have.has(w) || w === current - 1) rest.push(w);
  return [...rest.slice(0, max - 1), current];
}

// ---------- Payload per `dunkest_games_apply` ----------

export interface GameRow {
  dunkest_id: number;
  game_date: string;
  name: string;
  pos: Position | null;
  team_code: string;
  pdk: number;
  min: number;
  starter: boolean;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
}

export interface WeekRow {
  dunkest_id: number;
  name: string;
  pos: Position | null;
  team_code: string;
  gp: number;
  pdk: number;
  pts: number;
  reb: number;
  ast: number;
}

export interface GamesPayload {
  season_id: number;
  games: GameRow[];
  weeks: { week: number; stats: WeekRow[] }[];
}

const fullName = (g: Pick<SourceGame, "firstName" | "lastName">) => `${g.firstName} ${g.lastName}`.trim();
const round2 = (n: number) => Math.round(n * 100) / 100;

export function gameRows(day: string, games: SourceGame[]): GameRow[] {
  return games.map((g) => ({
    dunkest_id: g.dunkestId,
    game_date: day,
    name: fullName(g),
    pos: g.pos,
    team_code: g.teamCode,
    pdk: g.pdk,
    min: g.min,
    starter: g.starter,
    pts: g.pts,
    reb: g.reb,
    ast: g.ast,
    stl: g.stl,
    blk: g.blk,
    tov: g.tov,
  }));
}

/** Totale di una giornata: somma dei round (un giocatore compare in ogni round in cui ha giocato). */
export function weekRows(rounds: SourceGame[][]): WeekRow[] {
  const by = new Map<number, WeekRow>();
  for (const g of rounds.flat()) {
    const w = by.get(g.dunkestId);
    if (!w) by.set(g.dunkestId, { dunkest_id: g.dunkestId, name: fullName(g), pos: g.pos, team_code: g.teamCode, gp: g.gp, pdk: g.pdk, pts: g.pts, reb: g.reb, ast: g.ast });
    else {
      w.team_code = g.teamCode; // ha cambiato squadra a metà giornata: vale l'ultima
      w.gp += g.gp;
      w.pdk = round2(w.pdk + g.pdk);
      w.pts += g.pts;
      w.reb += g.reb;
      w.ast += g.ast;
    }
  }
  return [...by.values()];
}

// ---------- Vista per le pagine ----------

/** Riga di una classifica NBA (notte o giornata): `playerId` null = non è (ancora) nel listone. */
export interface LeaderRow {
  dunkestId: number;
  playerId: number | null;
  name: string;
  pos: Position | null;
  teamCode: string;
  pdk: number;
  pts: number;
  reb: number;
  ast: number;
  /** minuti (solo per la notte) */
  min: number | null;
  /** partite giocate nella giornata (solo per la giornata) */
  gp: number | null;
}

/** Una partita di un giocatore, per l'andamento. */
export interface GameLine {
  date: string;
  pdk: number;
  min: number;
  starter: boolean;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
}

export interface GameLogSummary {
  games: number;
  avg: number;
  best: GameLine;
  /** media delle ultime 5 partite e scarto dalla media della stagione, per dire se è in crescita */
  last5: number;
  trend: number;
}

/** `lines` dal più vecchio al più recente. */
export function summarizeGames(lines: GameLine[]): GameLogSummary | null {
  if (lines.length === 0) return null;
  const mean = (l: GameLine[]) => l.reduce((s, g) => s + g.pdk, 0) / l.length;
  const avg = mean(lines);
  const last5 = mean(lines.slice(-5));
  return {
    games: lines.length,
    avg: Math.round(avg * 10) / 10,
    best: lines.reduce((b, g) => (g.pdk > b.pdk ? g : b)),
    last5: Math.round(last5 * 10) / 10,
    trend: Math.round((last5 - avg) * 10) / 10,
  };
}
