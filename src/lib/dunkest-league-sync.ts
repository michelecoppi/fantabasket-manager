// Parte di lega del job giornaliero Dunkest (issue #72): classifica, calendario e formazioni dall'API dell'app della lega.
// Gira dopo statistiche e infortuni (dunkest-sync.ts), dal cron e dal pulsante admin. Usa il token personale DUNKEST_TOKEN
// (solo su Vercel, mai nel database né nei log) e fa solo letture.
import type { createClient } from "@/lib/supabase/server";
import { SourceFormatError } from "./dunkest";
import {
  buildLeaguePayload,
  leagueUrls,
  matchdaysToRead,
  MAX_MATCHDAYS,
  parseMatchday,
  parseMatchDetail,
  parseStandings,
  parseTournament,
  windowAround,
  type FetchedMatchday,
  type KnownMatchday,
  type LeagueErrorCode,
  type LeagueReport,
  type LeagueTeamLink,
  type SourceMatchDetail,
} from "./dunkest-league";

type Db = Awaited<ReturnType<typeof createClient>>;

export type LeagueSyncResult =
  | { ok: true; standings: number; matches: number; lineups: number; report: LeagueReport }
  | { ok: false; code: LeagueErrorCode; error: string };

const TIMEOUT_MS = 15_000;
/** Richieste contemporanee verso Dunkest: poche, il calendario completo sono ~100 giornate una volta a settimana. */
const PARALLEL = 6;

/** Dunkest ha rifiutato il token (401): va rinnovato, i dati restano quelli di prima. */
class TokenRejected extends Error {}
/** Risorsa che non esiste (giornata oltre l'ultima del torneo). */
class NotFound extends Error {}

async function getJson(url: string, token: string, what: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        Origin: "https://fantasy.dunkest.com",
        Referer: "https://fantasy.dunkest.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`${what}: Dunkest non risponde (${e instanceof Error ? e.message : String(e)})`);
  }
  if (res.status === 401) throw new TokenRejected(`${what}: Dunkest ha rifiutato il token (HTTP 401), va rinnovato`);
  if (res.status === 404) throw new NotFound(`${what}: HTTP 404`);
  if (!res.ok) throw new Error(`${what}: Dunkest ha risposto HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new SourceFormatError(`${what}: la risposta non è JSON`);
  }
}

/** Esegue `fn` su tutti gli elementi, al massimo PARALLEL alla volta, nell'ordine dato. */
async function inBatches<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += PARALLEL) out.push(...(await Promise.all(items.slice(i, i + PARALLEL).map(fn))));
  return out;
}

/**
 * Calendario completo: dalla giornata d'inizio in avanti, a gruppi, fino al primo 404 (dopo l'ultima giornata). Le giornate
 * senza scontri (prima dell'inizio) si saltano; il numero di giornata è la posizione tra quelle con scontri.
 */
async function readFullCalendar(token: string, tournamentId: number, startId: number): Promise<FetchedMatchday[]> {
  const found: { id: number; matches: FetchedMatchday["matches"] }[] = [];
  for (let id = startId; id < startId + MAX_MATCHDAYS; id += PARALLEL) {
    const ids = Array.from({ length: PARALLEL }, (_, k) => id + k);
    const res = await Promise.all(
      ids.map((mdId) =>
        getJson(leagueUrls.matchday(tournamentId, mdId), token, `giornata ${mdId}`).then(
          (json) => ({ id: mdId, matches: parseMatchday(json) }),
          (e) => {
            if (e instanceof NotFound) return null;
            throw e;
          },
        ),
      ),
    );
    const end = res.indexOf(null);
    for (const r of end < 0 ? res : res.slice(0, end)) if (r && r.matches.length > 0) found.push(r);
    if (end >= 0) return found.map((r, i) => ({ dunkestMatchdayId: r.id, matchday: i + 1, matches: r.matches }));
  }
  throw new SourceFormatError(`calendario: più di ${MAX_MATCHDAYS} giornate, la fonte è cambiata?`);
}

interface LeagueSourceRpc {
  season_id: number;
  league_id: number | null;
  tournament_id: number;
  calendar_at: string | null;
  teams: { team_id: string; dunkest_team_id: number; name: string }[];
  players: { id: number; first_name: string; last_name: string; nba_team: string | null; fantasy_id: number | null }[];
  matchdays: { dunkest_matchday_id: number; matchday: number; scored: boolean }[];
}

/**
 * Legge classifica, giornate (tutte una volta a settimana, altrimenti quelle intorno all'ultima giocata) e formazioni degli
 * scontri iniziati in quelle giornate, poi scrive tutto con `dunkest_league_apply` (una transazione). Se qualcosa va storto non
 * scrive nulla e `dunkest_league_fail` registra il motivo: un 401 diventa «token da rinnovare».
 */
export async function runDunkestLeagueSync(db: Db, secret: string | null, token: string | undefined): Promise<LeagueSyncResult> {
  const source = await db.rpc("dunkest_league_source", { p_secret: secret });
  if (source.error) return { ok: false, code: "error", error: source.error.message };
  const src = source.data as LeagueSourceRpc;

  const fail = async (code: LeagueErrorCode, error: string): Promise<LeagueSyncResult> => {
    await db.rpc("dunkest_league_fail", { p_secret: secret, p_code: code, p_error: error });
    return { ok: false, code, error };
  };
  if (!token) return fail("token_missing", "DUNKEST_TOKEN non impostato: classifica, calendario e formazioni non si aggiornano");

  try {
    const standings = parseStandings(await getJson(leagueUrls.standings(src.tournament_id), token, "classifica"));

    const known: KnownMatchday[] = src.matchdays.map((m) => ({ dunkestMatchdayId: m.dunkest_matchday_id, matchday: m.matchday, scored: m.scored }));
    const plan = matchdaysToRead(known, src.calendar_at, new Date());
    let matchdays: FetchedMatchday[];
    if (plan.full) {
      const { startingMatchdayId } = parseTournament(await getJson(leagueUrls.tournament(src.tournament_id), token, "torneo"));
      matchdays = await readFullCalendar(token, src.tournament_id, startingMatchdayId);
      if (matchdays.length === 0) throw new SourceFormatError("calendario: nessuna giornata con scontri");
    } else {
      matchdays = await inBatches(plan.matchdays, async (m) => ({
        dunkestMatchdayId: m.dunkestMatchdayId,
        matchday: m.matchday,
        matches: parseMatchday(await getJson(leagueUrls.matchday(src.tournament_id, m.dunkestMatchdayId), token, `giornata ${m.matchday}`)),
      }));
    }

    // Formazioni: solo gli scontri già iniziati delle giornate intorno all'ultima giocata.
    const sorted = [...matchdays].sort((a, b) => a.matchday - b.matchday);
    const window = windowAround(sorted.map((m) => ({ ...m, scored: m.matches.some((x) => x.home.pts !== null || x.away.pts !== null) })));
    const started = window.flatMap((m) => m.matches.filter((x) => x.home.pts !== null || x.away.pts !== null));
    const details: SourceMatchDetail[] = await inBatches(started, async (m) => parseMatchDetail(await getJson(leagueUrls.match(m.id), token, `scontro ${m.id}`)));

    const teams: LeagueTeamLink[] = src.teams.map((t) => ({ teamId: t.team_id, dunkestTeamId: t.dunkest_team_id, name: t.name }));
    const payload = buildLeaguePayload({
      seasonId: src.season_id,
      teams,
      players: src.players.map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, nbaTeam: p.nba_team, fantasyId: p.fantasy_id })),
      standings,
      matchdays,
      details,
      full: plan.full,
    });
    const applied = await db.rpc("dunkest_league_apply", { p_secret: secret, p_payload: payload });
    if (applied.error) throw new Error(`scrittura: ${applied.error.message}`);
    const counts = applied.data as { standings: number; matches: number; lineups: number };
    return { ok: true, ...counts, report: payload.report };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return fail(e instanceof TokenRejected ? "token_rejected" : "error", error);
  }
}
