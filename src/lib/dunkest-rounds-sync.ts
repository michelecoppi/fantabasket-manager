// Round delle giornate NBA nel job giornaliero: orari e partite giocate dal calendario NBA dell'app Fantaking (pubblico, senza
// token). Lo chiamano il cron (`/api/dunkest`) e il pulsante admin "Aggiorna ora", dopo la lega: le giornate da leggere sono
// quelle del calendario della lega già salvato.
import type { createClient } from "@/lib/supabase/server";
import { SourceFormatError } from "./dunkest";
import { buildRoundsPayload, parseScheduleConfig, parseScheduleMatchday, roundDaysToRead, roundUrls, type KnownRoundDay, type SourceRound } from "./dunkest-rounds";
import { download } from "./dunkest-sync";

type Db = Awaited<ReturnType<typeof createClient>>;

export type RoundsSyncResult = { ok: true; full: boolean; matchdays: number; rounds: number } | { ok: false; error: string };

interface SourceRpc {
  season_id: number;
  rounds_at: string | null;
  matchdays: { dunkest_matchday_id: number; matchday: number; rounds: number; completed: number }[];
}

/** Richieste in parallelo: poche, il giro completo sono ~100 giornate una volta a settimana. */
const PARALLEL = 6;

async function getJson(url: string, what: string): Promise<unknown> {
  const res = await download(url, what);
  try {
    return await res.json();
  } catch {
    throw new SourceFormatError(`${what}: la risposta non è JSON`);
  }
}

/**
 * Legge i round delle giornate da aggiornare (tutte una volta a settimana, altrimenti quelle intorno alla prima non finita) e
 * li scrive con `dunkest_rounds_apply` (una transazione). Se una lettura fallisce non scrive nulla: restano i round di prima.
 */
export async function runDunkestRoundsSync(db: Db, secret: string | null, now = new Date()): Promise<RoundsSyncResult> {
  const source = await db.rpc("dunkest_rounds_source", { p_secret: secret });
  if (source.error) return { ok: false, error: source.error.message };
  const src = source.data as SourceRpc;
  if (src.matchdays.length === 0) return { ok: true, full: false, matchdays: 0, rounds: 0 };

  try {
    const config = parseScheduleConfig(await getJson(roundUrls.config, "calendario NBA"));
    // Il calendario NBA di adesso deve essere quello della stagione della lega: almeno una giornata in comune.
    const ids = new Set(config.matchdayIds);
    if (!src.matchdays.some((m) => ids.has(m.dunkest_matchday_id))) {
      throw new SourceFormatError(`calendario NBA ${config.scheduleId}: nessuna giornata in comune con il calendario della lega`);
    }
    const known: KnownRoundDay[] = src.matchdays.map((m) => ({ dunkestMatchdayId: m.dunkest_matchday_id, matchday: m.matchday, rounds: m.rounds, completed: m.completed }));
    const plan = roundDaysToRead(known, src.rounds_at, now);
    const toRead = plan.full ? known : plan.days;

    const days: { dunkestMatchdayId: number; matchday: number; rounds: SourceRound[] }[] = [];
    for (let i = 0; i < toRead.length; i += PARALLEL) {
      const chunk = await Promise.all(
        toRead.slice(i, i + PARALLEL).map(async (d) => ({
          dunkestMatchdayId: d.dunkestMatchdayId,
          matchday: d.matchday,
          rounds: parseScheduleMatchday(await getJson(roundUrls.matchday(config.scheduleId, d.dunkestMatchdayId), `round della giornata ${d.matchday}`), d.dunkestMatchdayId),
        })),
      );
      days.push(...chunk);
    }
    if (plan.full && days.every((d) => d.rounds.length === 0)) throw new SourceFormatError("calendario NBA: nessuna giornata con partite");

    const applied = await db.rpc("dunkest_rounds_apply", { p_secret: secret, p_payload: buildRoundsPayload(src.season_id, plan.full, days) });
    if (applied.error) throw new Error(`scrittura: ${applied.error.message}`);
    const counts = applied.data as { matchdays: number; rounds: number };
    return { ok: true, full: plan.full, ...counts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
