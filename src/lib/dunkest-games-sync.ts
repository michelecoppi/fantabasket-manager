// Job giornaliero delle partite NBA su Dunkest: giorni di gioco (leader della notte, andamento dei giocatori) e giornate fantasy
// (leader della giornata). Lo chiamano il cron (`/api/dunkest`) e il pulsante admin "Aggiorna ora", dopo statistiche e lega:
// i giocatori nuovi sono già nel listone e la giornata in corso è già nel calendario.
import type { createClient } from "@/lib/supabase/server";
import {
  dunkestDayUrl,
  dunkestRoundUrl,
  GAME_DAYS_MAX,
  gameDaysToRead,
  gameRows,
  nbaToday,
  parseGames,
  ROUNDS_PER_WEEK,
  seasonStartDay,
  weekRows,
  weeksToRead,
  type GamesPayload,
  type GameRow,
  type SourceGame,
} from "./dunkest-games";
import { download } from "./dunkest-sync";

type Db = Awaited<ReturnType<typeof createClient>>;

export type GamesSyncResult = { ok: true; games: number; weeks: number; days: number; skipped: string[] } | { ok: false; error: string };

interface SourceRpc {
  season_id: number;
  dunkest_season_id: number;
  year: number;
  last_date: string | null;
  current_week: number | null;
  weeks: number[];
}

/** Richieste in parallelo: poche, per non pesare su Dunkest. */
const PARALLEL = 4;
const ATTEMPTS = 3;
const RETRY_MS = 1_000;

/** Dunkest risponde a volte "DB error: failed to connect to database." con HTTP 200: si riprova, poi si lascia l'errore. */
async function fetchGames(url: string, what: string, single: boolean): Promise<SourceGame[]> {
  let last = "";
  for (let i = 0; i < ATTEMPTS; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, RETRY_MS));
    try {
      const text = await (await download(url, what)).text();
      try {
        return parseGames(JSON.parse(text), single);
      } catch (e) {
        throw e instanceof SyntaxError ? new Error(`${what}: ${text.slice(0, 60)}`) : e;
      }
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(last);
}

/** Esegue `job` su tutti gli elementi, `PARALLEL` alla volta, e dà l'esito di ognuno nell'ordine di partenza. */
async function settled<T, R>(items: T[], job: (item: T) => Promise<R>): Promise<(R | Error)[]> {
  const out: (R | Error)[] = [];
  for (let i = 0; i < items.length; i += PARALLEL) {
    const chunk = await Promise.allSettled(items.slice(i, i + PARALLEL).map(job));
    for (const r of chunk) out.push(r.status === "fulfilled" ? r.value : r.reason instanceof Error ? r.reason : new Error(String(r.reason)));
  }
  return out;
}

/**
 * Legge i giorni nuovi (dal più vecchio, fino al primo che non si legge: il giro dopo riparte da lì) e le giornate da leggere,
 * poi scrive tutto con `dunkest_games_apply` (una transazione). Una giornata che non si legge si salta e si dice in `skipped`.
 */
export async function runDunkestGamesSync(db: Db, secret: string | null, now = new Date()): Promise<GamesSyncResult> {
  const source = await db.rpc("dunkest_games_source", { p_secret: secret });
  if (source.error) return { ok: false, error: source.error.message };
  const src = source.data as SourceRpc;
  const skipped: string[] = [];

  try {
    const today = nbaToday(now);
    const days = gameDaysToRead(src.last_date, today, seasonStartDay(src.year));
    if (days.length === GAME_DAYS_MAX && days[days.length - 1] < today) skipped.push("Recupero delle partite non finito: al prossimo aggiornamento continua");
    const dayResults = await settled(days, (day) => fetchGames(dunkestDayUrl(src.dunkest_season_id, day), `partite del ${day}`, true));
    const games: GameRow[] = [];
    let read = 0;
    for (const [i, res] of dayResults.entries()) {
      if (res instanceof Error) {
        skipped.push(`${res.message} (si riprova al prossimo aggiornamento)`);
        break;
      }
      read++;
      games.push(...gameRows(days[i], res));
    }

    const weeks: GamesPayload["weeks"] = [];
    for (const week of weeksToRead(src.current_week, src.weeks)) {
      const rounds = Array.from({ length: ROUNDS_PER_WEEK }, (_, i) => i + 1);
      const results = await settled(rounds, (round) => fetchGames(dunkestRoundUrl(src.dunkest_season_id, week, round), `giornata ${week}, round ${round}`, false));
      const failed = results.find((r): r is Error => r instanceof Error);
      if (failed) {
        skipped.push(`${failed.message}: giornata ${week} non aggiornata`);
        continue;
      }
      weeks.push({ week, stats: weekRows(results as SourceGame[][]) });
    }

    if (games.length === 0 && weeks.every((w) => w.stats.length === 0)) return { ok: true, games: 0, weeks: 0, days: read, skipped };
    const payload: GamesPayload = { season_id: src.season_id, games, weeks };
    const applied = await db.rpc("dunkest_games_apply", { p_secret: secret, p_payload: payload });
    if (applied.error) throw new Error(`scrittura: ${applied.error.message}`);
    const counts = applied.data as { games: number; weeks: number };
    return { ok: true, games: counts.games, weeks: counts.weeks, days: read, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
