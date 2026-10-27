// Job giornaliero dei dati Dunkest (issue #68): l'unico punto dell'app che chiama dunkest.com. Lo usano il cron
// (`/api/dunkest`, con il segreto) e il pulsante admin "Aggiorna ora" (sessione admin, segreto null).
import type { createClient } from "@/lib/supabase/server";
import { buildSyncPayload, DUNKEST_INJURIES_URL, dunkestStatsUrl, parseInjuries, parseStats, type DbPlayer, type LinkReport } from "./dunkest";

type Db = Awaited<ReturnType<typeof createClient>>;

export type SyncResult = { ok: true; stats: number; injuries: number; links: number; report: LinkReport } | { ok: false; error: string };

// Gli endpoint non chiedono autenticazione ma rifiutano i client senza User-Agent da browser.
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "Accept-Language": "it-IT,it" };
const TIMEOUT_MS = 20_000;

async function download(url: string, what: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`${what}: Dunkest non risponde (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!res.ok) throw new Error(`${what}: Dunkest ha risposto HTTP ${res.status}`);
  return res;
}

interface SourceRpc {
  season_id: number;
  dunkest_season_id: number;
  players: { id: number; first_name: string; last_name: string; nba_team: string | null; dunkest_id: number | null; rostered: boolean }[];
}

/**
 * Scarica statistiche e infortuni, li collega ai giocatori e li scrive con `dunkest_sync_apply` (una transazione).
 * Se qualcosa va storto non si scrive nulla: `dunkest_sync_fail` registra il motivo e le pagine continuano a mostrare
 * gli ultimi dati validi.
 */
export async function runDunkestSync(db: Db, secret: string | null): Promise<SyncResult> {
  const source = await db.rpc("dunkest_sync_source", { p_secret: secret });
  // Senza permessi non si può nemmeno registrare l'errore.
  if (source.error) return { ok: false, error: source.error.message };
  const src = source.data as SourceRpc;

  try {
    const [statsRes, injuriesRes] = await Promise.all([download(dunkestStatsUrl(src.dunkest_season_id), "statistiche"), download(DUNKEST_INJURIES_URL, "infortuni")]);
    let statsJson: unknown;
    try {
      statsJson = await statsRes.json();
    } catch {
      throw new Error("statistiche: la risposta non è JSON");
    }
    const stats = parseStats(statsJson);
    const injuries = parseInjuries(await injuriesRes.text());

    const players: DbPlayer[] = src.players.map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, nbaTeam: p.nba_team, dunkestId: p.dunkest_id, rostered: p.rostered }));
    const payload = buildSyncPayload(src.season_id, players, stats, injuries);
    const applied = await db.rpc("dunkest_sync_apply", { p_secret: secret, p_payload: payload });
    if (applied.error) throw new Error(`scrittura: ${applied.error.message}`);
    const counts = applied.data as { stats: number; injuries: number };
    return { ok: true, stats: counts.stats, injuries: counts.injuries, links: payload.links.length, report: payload.report };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.rpc("dunkest_sync_fail", { p_secret: secret, p_error: error });
    return { ok: false, error };
  }
}
