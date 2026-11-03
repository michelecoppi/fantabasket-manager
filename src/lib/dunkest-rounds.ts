// Round delle giornate NBA su Dunkest: quanti sono, quando inizia ognuno e quanti sono finiti. Servono al countdown della
// prossima giornata o del prossimo round e ai round completati delle giornate chiuse. Tutto puro e testato; le richieste di
// rete stanno in dunkest-rounds-sync.ts, che gira solo nel job giornaliero (le pagine leggono dal database).
import { SourceFormatError } from "./dunkest";

// ---------- Fonte (API dell'app Fantaking, pubblica: niente token. Verificata il 2026-11-03) ----------

const API = "https://fantaking-api.dunkest.com/api/v1";
export const roundUrls = {
  /** `leagues/1` è l'NBA: `current_schedule_id` è il calendario della stagione, `matchdays` le giornate di stagione regolare */
  config: `${API}/leagues/1/config`,
  /** una giornata del calendario NBA: `rounds[]` con le partite (`started_at`, `status`); `rounds: []` se non ha partite */
  matchday: (scheduleId: number, dunkestMatchdayId: number) => `${API}/schedules/${scheduleId}/matchdays/${dunkestMatchdayId}`,
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const iso = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

export interface ScheduleConfig {
  scheduleId: number;
  /** id Dunkest delle giornate del calendario NBA (non tutte: la 19, senza partite, non c'è) */
  matchdayIds: number[];
}

export function parseScheduleConfig(json: unknown): ScheduleConfig {
  const d = obj(obj(json)?.data);
  const scheduleId = int(d?.current_schedule_id);
  if (!d || scheduleId === null) throw new SourceFormatError("calendario NBA: manca current_schedule_id");
  if (!Array.isArray(d.matchdays)) throw new SourceFormatError("calendario NBA: matchdays non è una lista");
  const matchdayIds = d.matchdays.map((m) => int(obj(m)?.id)).filter((x): x is number => x !== null);
  return { scheduleId, matchdayIds };
}

/** Un round come lo salviamo: inizio = prima partita, fine = inizio dell'ultima partita (Dunkest non dà l'ora di fine). */
export interface SourceRound {
  round: number;
  dunkestRoundId: number;
  startsAt: string;
  endsAt: string;
  games: number;
  /** partite con `status = played` */
  played: number;
}

/** Round di una giornata, in ordine. Lista vuota ammessa (giornata senza partite, es. la pausa di dicembre o i playoff da fissare). */
export function parseScheduleMatchday(json: unknown, dunkestMatchdayId: number): SourceRound[] {
  const d = obj(obj(json)?.data);
  if (!d) throw new SourceFormatError(`giornata NBA ${dunkestMatchdayId}: risposta senza "data"`);
  if (int(d.id) !== dunkestMatchdayId) throw new SourceFormatError(`giornata NBA ${dunkestMatchdayId}: la risposta è di un'altra giornata (${String(d.id)})`);
  if (!Array.isArray(d.rounds)) throw new SourceFormatError(`giornata NBA ${dunkestMatchdayId}: rounds non è una lista`);
  const out: SourceRound[] = [];
  for (const r of d.rounds) {
    const o = obj(r);
    const round = int(o?.number);
    const id = int(o?.id);
    if (!o || round === null || round < 1 || id === null || !Array.isArray(o.matches)) {
      throw new SourceFormatError(`giornata NBA ${dunkestMatchdayId}: round senza numero, id o partite (${JSON.stringify(r).slice(0, 100)})`);
    }
    if (o.matches.length === 0) continue;
    const times = o.matches.map((m) => iso(obj(m)?.started_at));
    if (times.some((t) => t === null)) throw new SourceFormatError(`giornata NBA ${dunkestMatchdayId}, round ${round}: partita senza orario`);
    const sorted = (times as string[]).sort();
    out.push({
      round,
      dunkestRoundId: id,
      startsAt: sorted[0],
      endsAt: sorted[sorted.length - 1],
      games: o.matches.length,
      played: o.matches.filter((m) => obj(m)?.status === "played").length,
    });
  }
  if (new Set(out.map((r) => r.round)).size !== out.length) throw new SourceFormatError(`giornata NBA ${dunkestMatchdayId}: round ripetuti`);
  return out.sort((a, b) => a.round - b.round);
}

// ---------- Quali giornate leggere ----------

/** Giornata della lega con i round salvati: `rounds` = quanti, `completed` = quanti con tutte le partite giocate. */
export interface KnownRoundDay {
  dunkestMatchdayId: number;
  matchday: number;
  rounds: number;
  completed: number;
}

/** Tutte le giornate si rileggono al primo giro e poi una volta a settimana (orari spostati, playoff fissati dopo). */
export const ROUNDS_MAX_AGE_DAYS = 7;

/**
 * Giornate da rileggere oggi: tutte se non ci sono round salvati o l'ultima lettura completa è vecchia, altrimenti la prima
 * non finita, quella prima (per chiuderne i round il giorno dopo) e le due dopo. Le giornate senza round (pausa, playoff) si
 * rileggono solo con il giro completo.
 */
export function roundDaysToRead(known: KnownRoundDay[], roundsAt: string | null, now: Date): { full: boolean; days: KnownRoundDay[] } {
  const stale = !roundsAt || now.getTime() - new Date(roundsAt).getTime() > ROUNDS_MAX_AGE_DAYS * 86_400_000;
  const withRounds = [...known].filter((d) => d.rounds > 0).sort((a, b) => a.matchday - b.matchday);
  if (withRounds.length === 0 || stale) return { full: true, days: [] };
  const open = withRounds.findIndex((d) => d.completed < d.rounds);
  if (open < 0) return { full: false, days: withRounds.slice(-1) };
  return { full: false, days: withRounds.slice(Math.max(0, open - 1), open + 3) };
}

// ---------- Payload per `dunkest_rounds_apply` ----------

export interface RoundsPayload {
  season_id: number;
  full: boolean;
  matchdays: {
    dunkest_matchday_id: number;
    matchday: number;
    rounds: { round: number; dunkest_round_id: number; starts_at: string; ends_at: string; games: number; played: number }[];
  }[];
}

export function buildRoundsPayload(seasonId: number, full: boolean, days: { dunkestMatchdayId: number; matchday: number; rounds: SourceRound[] }[]): RoundsPayload {
  return {
    season_id: seasonId,
    full,
    matchdays: days.map((d) => ({
      dunkest_matchday_id: d.dunkestMatchdayId,
      matchday: d.matchday,
      rounds: d.rounds.map((r) => ({ round: r.round, dunkest_round_id: r.dunkestRoundId, starts_at: r.startsAt, ends_at: r.endsAt, games: r.games, played: r.played })),
    })),
  };
}

// ---------- Vista per le pagine ----------

export interface RoundInfo {
  round: number;
  startsAt: string;
  endsAt: string;
  games: number;
  played: number;
}

/** Round finito: tutte le partite giocate all'ultimo aggiornamento (una partita rinviata lo lascia aperto). */
export const roundDone = (r: RoundInfo) => r.games > 0 && r.played >= r.games;

/**
 * Dove sta una giornata adesso, dai round salvati:
 * none = round non ancora noti; upcoming = il primo round non è iniziato; live = iniziata e non tutti i round finiti, con il
 * prossimo round da iniziare (null se sono iniziati tutti); done = tutti i round finiti, oppure `DAY_CLOSED_AFTER_MS` dopo
 * l'ultima partita (una partita rinviata non tiene aperta la giornata per sempre: i round completati restano meno del totale).
 */
export type DayTiming =
  | { kind: "none" }
  | { kind: "upcoming"; total: number; startsAt: string }
  | { kind: "live"; total: number; completed: number; next: RoundInfo | null }
  | { kind: "done"; total: number; completed: number };

/** Una giornata con una partita mai giocata si considera chiusa un giorno e mezzo dopo l'inizio dell'ultima partita. */
export const DAY_CLOSED_AFTER_MS = 36 * 3_600_000;

export function dayTiming(rounds: RoundInfo[], now: Date): DayTiming {
  if (rounds.length === 0) return { kind: "none" };
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  const t = now.getTime();
  const total = sorted.length;
  const completed = sorted.filter(roundDone).length;
  const lastGame = Math.max(...sorted.map((r) => Date.parse(r.endsAt)));
  if (completed === total || t > lastGame + DAY_CLOSED_AFTER_MS) return { kind: "done", total, completed };
  if (t < Date.parse(sorted[0].startsAt)) return { kind: "upcoming", total, startsAt: sorted[0].startsAt };
  return { kind: "live", total, completed, next: sorted.find((r) => Date.parse(r.startsAt) > t) ?? null };
}

/** Prossimo round che deve iniziare, tra le giornate date (in ordine di giornata), o null. */
export function nextRound(days: { matchday: number; rounds: RoundInfo[] }[], now: Date): { matchday: number; round: RoundInfo; total: number } | null {
  const t = now.getTime();
  for (const d of [...days].sort((a, b) => a.matchday - b.matchday)) {
    const sorted = [...d.rounds].sort((a, b) => a.round - b.round);
    const r = sorted.find((x) => Date.parse(x.startsAt) > t);
    if (r) return { matchday: d.matchday, round: r, total: sorted.length };
  }
  return null;
}

/** Prima giornata dopo `matchday` che ha dei round (salta quelle senza partite, come la pausa di dicembre), o null. */
export function followingDay(rounds: Map<number, RoundInfo[]>, matchday: number): { matchday: number; rounds: RoundInfo[] } | null {
  const next = [...rounds.keys()].filter((d) => d > matchday && (rounds.get(d)?.length ?? 0) > 0).sort((a, b) => a - b)[0];
  return next === undefined ? null : { matchday: next, rounds: rounds.get(next)! };
}

/**
 * Tempo che manca come caselle del tabellone: giorni (solo se ce ne sono), ore, minuti e secondi; sotto l'ora restano minuti e
 * secondi. Già passato = 0 minuti e 0 secondi.
 */
export function countdownParts(ms: number): { value: number; unit: "g" | "h" | "m" | "s" }[] {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const parts = [
    { value: d, unit: "g" as const },
    { value: h, unit: "h" as const },
    { value: Math.floor((s % 3600) / 60), unit: "m" as const },
    { value: s % 60, unit: "s" as const },
  ];
  return parts.slice(d > 0 ? 0 : h > 0 ? 1 : 2);
}

/** Tempo che manca in parole brevi: "2g 5h", "5h 12m", "12m 30s", "30s"; "0s" se è già passato. */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
