import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { LastContract } from "./cap";
import { buildDunkest, EMPTY_DUNKEST, type DunkestView, type InjuryRow, type LinkReport, type StatRow } from "./dunkest";
import { buildLeagueView, EMPTY_LEAGUE, type DunkestLeagueView, type DunkestRosterPlayer, type LeagueReport, type LeagueSyncInfo, type LineupPlayer } from "./dunkest-league";
import type { PlayerListItem } from "./players";
import { buildHistory, closedSeasonRows, type LeagueHistory } from "./league-history";
import { buildLeague, playerName, type ContractRow, type CutRow, type RawLeague, type LeagueView, type Versions } from "./league";
import { resolveProfile } from "./profile";
import type { CloseInput } from "./season-close";
import type { RosterMove } from "./roster-moves";
import { toProposal, type Proposal, type ProposalRow } from "./trade-proposals";

const playerCols = "players(first_name,last_name,pos,nba_team)";

const PAGE = 1000; // PostgREST (Supabase) taglia a max_rows = 1000 per richiesta, anche con .limit(2000)

type Result = { error: { message: string } | null };

/** Lancia il primo errore tra le risposte di Supabase. */
function must(...results: Result[]) {
  for (const r of results) if (r.error) throw new Error(r.error.message);
}

/**
 * Tutte le righe di una query, una pagina da 1000 alla volta (PostgREST non ne restituisce di più). `page` riceve l'intervallo
 * da passare a `.range()`; la query deve avere un ordine stabile tra una pagina e l'altra.
 */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result & { data: T[] | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const r = await page(from, from + PAGE - 1);
    must(r);
    const data = r.data ?? [];
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Raggruppa per chiave mantenendo l'ordine di arrivo. */
function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** Stagione corrente: una sola query per richiesta, condivisa da tutti i loader. */
const loadSeason = cache(async (): Promise<{ id: number; year: number }> => {
  const db = await createClient();
  const season = await db.from("seasons").select("id,year").eq("is_current", true).maybeSingle<{ id: number; year: number }>();
  if (season.error || !season.data) throw new Error("Stagione corrente non trovata");
  return season.data;
});

/**
 * Mercato degli scambi aperto o chiuso (Fase 7.1, `seasons.trade_market_open`, lo cambia un admin). Lettura a parte e
 * tollerante: null = stato non disponibile, così le pagine degli scambi si caricano anche se la colonna non si legge.
 */
export const loadTradeMarket = cache(async (): Promise<boolean | null> => {
  const db = await createClient();
  const r = await db.from("seasons").select("trade_market_open").eq("is_current", true).maybeSingle<{ trade_market_open: boolean }>();
  return r.error || !r.data ? null : r.data.trade_market_open;
});

/**
 * Proposte di scambio della stagione corrente (Fase 7), lette con RLS: un utente vede solo quelle della sua squadra, un admin
 * tutte. Tollerante come il mercato: null = non disponibili, e le pagine (e i badge nel layout) restano su.
 */
export const loadProposals = cache(async (): Promise<Proposal[] | null> => {
  const db = await createClient();
  const [season, profile] = await Promise.all([loadSeason(), loadProfile()]);
  // Senza squadra e senza ruolo admin la RLS non restituisce niente: si risparmia la query.
  if (!profile || (!profile.team_id && profile.role !== "admin")) return [];
  const r = await db
    .from("trade_proposals")
    .select(
      "id,version,status,proposer_team_id,teams,moves,message,cap_exception_reason,created_at,expires_at,decided_at,decision_note,parent_id,trade_id,dunkest_done_at,trade_proposal_answers(team_id,answer,note,at)",
    )
    .eq("season_id", season.id)
    .order("id", { ascending: false });
  if (r.error) return null;
  const now = Date.now();
  return ((r.data ?? []) as ProposalRow[]).map((row) => toProposal(row, now));
});

/**
 * Lega della stagione corrente come l'utente loggato (le policy RLS decidono cosa vede), più le versioni delle righe
 * modificabili dagli admin (migrazioni 0006-0007) per la concorrenza ottimistica delle RPC: stesse righe, una sola lettura.
 */
const loadLeagueData = cache(async () => {
  const db = await createClient();
  // La revisione di rosa (migrazione 0012) va letta PRIMA dei contratti: se una firma si infila nel mezzo, la revisione è più
  // vecchia dei dati e la RPC risponde CONFLICT, invece di accettare una validazione fatta su una rosa già cambiata.
  // Con la stagione non ha vincoli d'ordine: le due letture partono insieme (un giro verso il database in meno).
  const [season, rev] = await Promise.all([loadSeason(), db.from("teams").select("id,roster_rev")]);
  must(rev);
  const sid = season.id;

  const [teams, settings, contracts, cuts, talents, picks, teamSeason, rookie] = await Promise.all([
    db.from("teams").select("id,name,owner_name").order("name"),
    db.from("league_settings").select("key,value").eq("season_id", sid),
    db.from("contracts").select(`id,version,team_id,player_id,slot,years_left,team_option,salary,restriction,is_rookie,${playerCols}`).eq("season_id", sid),
    db
      .from("cuts")
      .select(`id,version,team_id,player_id,status,paid_salary,years_left,original_salary,original_slot,original_is_rookie,team_option,${playerCols}`)
      .eq("season_id", sid)
      .in("status", ["pending", "cut"]), // rientrati e assegnati non pesano più sul monte ingaggi
    db.from("talents").select(`id,version,team_id,player_id,display_name,draft_year,entry_credits,notes,${playerCols}`),
    db.from("draft_picks").select("id,version,year,round,original_team_id,current_team_id,to_confirm,note").order("year").order("round"),
    db.from("team_season").select("team_id,version,bonus,final_rank,entry_fee_paid,luxury_tax_paid").eq("season_id", sid),
    db.from("rookie_draft").select("pick_no,team_id,original_team_id,note").eq("season_id", sid),
  ]);
  must(teams, settings, contracts, cuts, talents, picks, teamSeason, rookie);

  const raw: RawLeague = {
    seasonYear: season.year,
    teams: teams.data ?? [],
    settings: settings.data ?? [],
    contracts: (contracts.data ?? []) as unknown as ContractRow[],
    cuts: (cuts.data ?? []) as unknown as CutRow[],
    talents: (talents.data ?? []) as unknown as RawLeague["talents"], // il join a players arriva come oggetto (FK many-to-one)
    picks: picks.data ?? [],
    teamSeason: teamSeason.data ?? [],
    rookieDraft: rookie.data ?? [],
  };
  const toMap = (rows: { id: number; version: number }[] | null) => Object.fromEntries((rows ?? []).map((r) => [r.id, r.version]));
  const versions: Versions = { contracts: toMap(contracts.data), picks: toMap(picks.data), cuts: toMap(cuts.data), talents: toMap(talents.data),
    teamSeason: Object.fromEntries((teamSeason.data ?? []).map((r) => [r.team_id, r.version])),
    rosterRev: Object.fromEntries((rev.data ?? []).map((r) => [r.id, r.roster_rev as number])),
  };
  return { league: buildLeague(raw), versions };
});

export const loadLeague = async (): Promise<LeagueView> => (await loadLeagueData()).league;
export const loadVersions = async (): Promise<Versions> => (await loadLeagueData()).versions;

/** Tutto ciò che serve a `planSeasonClose`: contratti (con versione) e tagli della stagione corrente, pick e luxury tax di adesso. */
export const loadCloseInput = cache(async (): Promise<CloseInput> => {
  const db = await createClient();
  const season = await loadSeason();
  const [league, contracts, cuts] = await Promise.all([
    loadLeague(),
    db.from("contracts").select(`id,version,team_id,years_left,team_option,is_rookie,restriction,${playerCols}`).eq("season_id", season.id),
    db.from("cuts").select(`id,version,team_id,status,years_left,${playerCols}`).eq("season_id", season.id).in("status", ["pending", "cut"]),
  ]);
  must(contracts, cuts);

  const years = (v: number | null) => (v === null ? null : Number(v));
  const rows = <T>(r: { data: unknown }) => (r.data ?? []) as T[];
  type Row = { id: number; version: number; team_id: string; years_left: number | null; players: Parameters<typeof playerName>[0] };
  return {
    seasonId: season.id,
    seasonYear: season.year,
    teams: league.teams.map((t) => ({ id: t.team.id, name: t.team.name, taxEur: t.finance.luxuryTaxEur, taxPaid: t.luxuryTaxPaid })),
    contracts: rows<Row & { team_option: boolean; is_rookie: boolean; restriction: "unrestricted" | null }>(contracts).map((c) => ({
      id: c.id,
      version: c.version,
      teamId: c.team_id,
      name: playerName(c.players),
      years: years(c.years_left),
      teamOption: c.team_option,
      isRookie: c.is_rookie,
      restriction: c.restriction,
    })),
    cuts: rows<Row & { status: "pending" | "cut" }>(cuts).map((c) => ({ id: c.id, version: c.version, teamId: c.team_id, name: playerName(c.players), status: c.status, years: years(c.years_left) })),
    picks: league.picks.map((p) => ({ year: p.year, round: p.round, originalTeamId: p.original_team_id, currentTeamId: p.current_team_id, toConfirm: p.to_confirm })),
  };
});

/** Profilo dell'utente loggato (ruolo e squadra). */
export const loadProfile = cache(async () => {
  const db = await createClient();
  // getClaims verifica il JWT in locale (chiavi asimmetriche ES256): niente giro di rete verso Auth. L'identità conta solo qui;
  // i permessi veri restano nel database (RLS e is_admin() leggono lo stesso JWT).
  const { data: auth } = await db.auth.getClaims();
  const claims = auth?.claims;
  if (!claims) return null;
  const email = typeof claims.email === "string" ? claims.email : "";
  const { data, error } = await db
    .from("profiles")
    .select("display_name,role,team_id")
    .eq("id", claims.sub)
    .maybeSingle<{ display_name: string; role: "admin" | "viewer"; team_id: string | null }>();
  return resolveProfile(email, data, error);
});

/** Listone Dunkest con l'eventuale proprietario nella stagione corrente. */
export const loadPlayers = cache(async (): Promise<PlayerListItem[]> => {
  const db = await createClient();
  const sid = (await loadSeason()).id;

  const [players, contracts, cuts, talents, restricted] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) =>
      db
        .from("players")
        .select("id,first_name,last_name,pos,nba_team,dunkest_credits")
        .order("last_name")
        .order("id") // ordine stabile tra una pagina e l'altra
        .range(from, to),
    ),
    db.from("contracts").select("player_id,team_id").eq("season_id", sid),
    db.from("cuts").select("player_id,team_id").eq("season_id", sid).in("status", ["pending", "cut"]),
    db.from("talents").select("player_id,team_id").not("player_id", "is", null),
    // In ordine di data: conta solo l'ultima scadenza di ogni giocatore (una successiva unrestricted cancella il diritto, R-24).
    db.from("last_contracts").select("player_id,team_id,restricted,salary,last_contract_on").order("last_contract_on").order("id"),
  ]);
  must(contracts, cuts, talents, restricted);

  const owner = new Map((contracts.data ?? []).map((c) => [c.player_id as number, c.team_id as string]));
  const talentOf = new Map((talents.data ?? []).map((t) => [t.player_id as number, t.team_id as string]));
  const cutBy = new Map((cuts.data ?? []).map((c) => [c.player_id as number, c.team_id as string]));
  // PostgREST taglia a 1000 righe: last_contracts ne ha poche decine all'anno, quindi basta una richiesta.
  const restrictedBy = new Map((restricted.data ?? []).map((c) => [c.player_id as number, c.restricted ? (c.team_id as string | null) : null]));
  // Stessa regola del restricted: l'ultima riga (per data, poi id) è quella che conta.
  const lastBy = new Map((restricted.data ?? []).map((c) => [c.player_id as number, { salary: Number(c.salary), on: c.last_contract_on as string }]));
  return players.map((p) => ({
    id: p.id as number,
    name: `${p.first_name ?? ""} ${p.last_name}`.trim(),
    pos: p.pos as PlayerListItem["pos"],
    nbaTeam: p.nba_team as string | null,
    credits: p.dunkest_credits === null ? null : Number(p.dunkest_credits),
    ownerTeamId: owner.get(p.id as number) ?? null,
    talentTeamId: talentOf.get(p.id as number) ?? null,
    cutByTeamId: cutBy.get(p.id as number) ?? null,
    restrictedTeamId: restrictedBy.get(p.id as number) ?? null,
    lastContract: lastBy.get(p.id as number) ?? null,
  }));
});

/** R-25: ultimo contratto di un giocatore (riga più recente di last_contracts), riletto dal database per i controlli server. */
export async function loadLastContract(playerId: number): Promise<LastContract | null> {
  const db = await createClient();
  const r = await db
    .from("last_contracts")
    .select("salary,last_contract_on,restricted")
    .eq("player_id", playerId)
    .order("last_contract_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ salary: number | string; last_contract_on: string; restricted: boolean }>();
  if (r.error) throw new Error(r.error.message);
  return r.data ? { salary: Number(r.data.salary), on: r.data.last_contract_on, restricted: r.data.restricted } : null;
}

/**
 * Dati Dunkest della stagione corrente (issue #68), scritti dal job giornaliero: le pagine non chiamano mai Dunkest.
 * Sono un contorno: se non si leggono (migrazione non applicata, errore) le pagine mostrano "dati non disponibili" e il resto funziona.
 */
export const loadDunkest = cache(async (): Promise<DunkestView> => {
  try {
    const db = await createClient();
    const sid = (await loadSeason()).id;
    type StatWithPlayer = Omit<StatRow, "pos"> & { players: { pos: StatRow["pos"] } | null };
    const [sync, injuries, statRows] = await Promise.all([
      db.from("dunkest_sync").select("last_attempt_at,last_success_at,last_error,source_updated_at,report").eq("id", 1).maybeSingle(),
      db.from("dunkest_injuries").select("player_id,injured_on,injury,description"),
      fetchAll<StatWithPlayer>(
        (from, to) =>
          db
            .from("dunkest_stats")
            .select("player_id,gp,pdk,min,pts,reb,ast,players(pos)")
            .eq("season_id", sid)
            .order("player_id")
            .range(from, to) as unknown as PromiseLike<Result & { data: StatWithPlayer[] | null }>,
      ),
    ]);
    must(sync, injuries);
    const stats: StatRow[] = statRows.map(({ players, ...row }) => ({ ...row, pos: players?.pos ?? null }));
    const s = sync.data;
    return buildDunkest(
      s && {
        lastSuccessAt: s.last_success_at as string | null,
        lastAttemptAt: s.last_attempt_at as string | null,
        lastError: s.last_error as string | null,
        sourceUpdatedAt: s.source_updated_at as string | null,
        report: s.report as LinkReport | null,
      },
      stats,
      (injuries.data ?? []) as InjuryRow[],
    );
  } catch (e) {
    console.error(`[dunkest] dati non disponibili: ${e instanceof Error ? e.message : String(e)}`);
    return EMPTY_DUNKEST;
  }
});

/**
 * Classifica e calendario della lega su Dunkest (issue #72), scritti dal job giornaliero. Come `loadDunkest`: se non si leggono
 * le pagine mostrano "dati non disponibili". Gli scontri di una stagione sono poche centinaia (8 squadre, ~100 giornate):
 * stanno sotto le 1000 righe di PostgREST.
 */
export const loadLeagueDunkest = cache(async (): Promise<DunkestLeagueView> => {
  try {
    const db = await createClient();
    const sid = (await loadSeason()).id;
    const [sync, standings, matches] = await Promise.all([
      db
        .from("dunkest_sync")
        .select("league_attempt_at,league_success_at,league_error,league_error_code,league_report,calendar_at,token_ok_since,token_ok_at,token_rejected_at")
        .eq("id", 1)
        .maybeSingle(),
      db.from("dunkest_standings").select("team_id,position,total_pts,wins,draws,losses").eq("season_id", sid),
      db.from("dunkest_matches").select("id,matchday,home_team_id,away_team_id,home_pts,away_pts,winner_team_id").eq("season_id", sid).order("matchday").order("id"),
    ]);
    must(sync, standings, matches);
    const s = sync.data;
    const num = (v: unknown) => (v === null ? null : Number(v));
    return buildLeagueView(
      s && {
        lastSuccessAt: s.league_success_at,
        lastAttemptAt: s.league_attempt_at,
        lastError: s.league_error,
        errorCode: s.league_error_code as LeagueSyncInfo["errorCode"],
        report: s.league_report as LeagueReport | null,
        calendarAt: s.calendar_at,
        tokenOkSince: s.token_ok_since,
        tokenOkAt: s.token_ok_at,
        tokenRejectedAt: s.token_rejected_at,
      },
      (standings.data ?? []).map((r) => ({ teamId: r.team_id, position: r.position, totalPts: Number(r.total_pts), wins: r.wins, draws: r.draws, losses: r.losses })),
      (matches.data ?? []).map((m) => ({
        id: Number(m.id),
        matchday: m.matchday,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homePts: num(m.home_pts),
        awayPts: num(m.away_pts),
        winnerTeamId: m.winner_team_id,
      })),
    );
  } catch (e) {
    console.error(`[dunkest] lega non disponibile: ${e instanceof Error ? e.message : String(e)}`);
    return EMPTY_LEAGUE;
  }
});

/**
 * Albo d'oro: classifiche finali delle stagioni concluse (prima dell'app da `league_history`, poi quelle chiuse nell'app) e
 * carriere delle squadre di oggi, col record della stagione in corso. Tollerante: null = storico non disponibile, la pagina
 * lo dice e il resto del sito non ne risente. Poche decine di righe: niente paginazione.
 */
export const loadHistory = cache(async (): Promise<LeagueHistory | null> => {
  try {
    const db = await createClient();
    const [season, league, live] = await Promise.all([loadSeason(), loadLeague(), loadLeagueDunkest()]);
    const [archive, seasons, standings, ranks] = await Promise.all([
      db.from("league_history").select("season_year,position,team_name,team_id,former_key,replaced_by,wins,losses,total_pts"),
      db.from("seasons").select("id,year").eq("is_current", false),
      db.from("dunkest_standings").select("season_id,team_id,position,total_pts,wins,draws,losses").neq("season_id", season.id),
      db.from("team_season").select("season_id,team_id,final_rank").neq("season_id", season.id),
    ]);
    must(archive, seasons, standings, ranks);
    const past = (archive.data ?? []).map((r) => ({
      seasonYear: r.season_year,
      position: r.position,
      teamName: r.team_name,
      teamId: r.team_id,
      formerKey: r.former_key,
      replacedBy: r.replaced_by,
      wins: r.wins,
      draws: 0, // gli screenshot di Dunkest delle stagioni passate non hanno pareggi
      losses: r.losses,
      totalPts: Number(r.total_pts),
    }));
    const app = closedSeasonRows(
      seasons.data ?? [],
      (standings.data ?? []).map((r) => ({ seasonId: r.season_id, teamId: r.team_id, position: r.position, totalPts: Number(r.total_pts), wins: r.wins, draws: r.draws, losses: r.losses })),
      (ranks.data ?? []).map((r) => ({ seasonId: r.season_id, teamId: r.team_id, finalRank: r.final_rank })),
      league.teamNames,
      new Set(past.map((r) => r.seasonYear)),
    );
    return buildHistory([...past, ...app], league.teams.map((t) => ({ id: t.team.id, name: t.team.name })), season.year, live.standings);
  } catch (e) {
    console.error(`[storico] non disponibile: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
});

/** Rose Dunkest della stagione corrente (13 giocatori per squadra, tribuna compresa): squadra → giocatori. Vuoto se non si leggono. */
export const loadDunkestRosters = cache(async (): Promise<Map<string, DunkestRosterPlayer[]>> => {
  try {
    const db = await createClient();
    const sid = (await loadSeason()).id;
    const r = await db.from("dunkest_rosters").select("team_id,fantasy_player_id,player_id,name,pos").eq("season_id", sid).order("name");
    must(r);
    const byTeam = groupBy(r.data ?? [], (row) => row.team_id);
    return new Map(
      [...byTeam].map(([team, rows]) => [
        team,
        rows.map((row) => ({ fantasyId: row.fantasy_player_id, playerId: row.player_id, name: row.name, pos: row.pos as DunkestRosterPlayer["pos"] })),
      ]),
    );
  } catch (e) {
    console.error(`[dunkest] rose non disponibili: ${e instanceof Error ? e.message : String(e)}`);
    return new Map();
  }
});

/**
 * Formazioni schierate negli scontri indicati: scontro → squadra → giocatori. Vuoto se non si leggono. Paginata (PostgREST
 * taglia a 1000 righe): una stagione intera, per la vetrina dei trofei, supera le 1000 righe dalla tredicesima giornata.
 */
export function loadLineups(matchIds: number[]): Promise<Map<number, Map<string, LineupPlayer[]>>> {
  // Chiave canonica: la stessa richiesta fatta da due componenti della pagina legge il database una volta sola.
  return loadLineupsByKey([...new Set(matchIds)].sort((a, b) => a - b).join(","));
}

const loadLineupsByKey = cache(async (key: string): Promise<Map<number, Map<string, LineupPlayer[]>>> => {
  if (key === "") return new Map();
  const matchIds = key.split(",").map(Number);
  try {
    const db = await createClient();
    const rows = await fetchAll((from, to) =>
      db
        .from("dunkest_lineups")
        .select("match_id,team_id,fantasy_player_id,player_id,name,pos,role,court_position,is_captain,is_sixth_man,pts")
        .in("match_id", matchIds)
        .order("match_id")
        .order("team_id")
        .order("court_position")
        .range(from, to),
    );
    const byMatch = groupBy(rows, (row) => Number(row.match_id));
    return new Map(
      [...byMatch].map(([match, matchRows]) => [
        match,
        new Map(
          [...groupBy(matchRows, (row) => row.team_id)].map(([team, teamRows]) => [
            team,
            teamRows.map(
              (row): LineupPlayer => ({
                fantasyId: row.fantasy_player_id,
                playerId: row.player_id,
                name: row.name,
                pos: row.pos as LineupPlayer["pos"],
                role: row.role as LineupPlayer["role"],
                courtPosition: row.court_position,
                isCaptain: row.is_captain,
                isSixthMan: row.is_sixth_man,
                pts: row.pts === null ? null : Number(row.pts),
              }),
            ),
          ]),
        ),
      ]),
    );
  } catch (e) {
    console.error(`[dunkest] formazioni non disponibili: ${e instanceof Error ? e.message : String(e)}`);
    return new Map();
  }
});

/** Cambi di rosa su Dunkest registrati dal job per una squadra, stagione corrente (Fase 6). Vuoto se non si leggono. */
export async function loadRosterMoves(teamId: string): Promise<Omit<RosterMove, "lastFielded">[]> {
  try {
    const db = await createClient();
    const sid = (await loadSeason()).id;
    const r = await db
      .from("dunkest_roster_moves")
      .select("fantasy_player_id,player_id,name,pos,move,seen_matchday,seen_at")
      .eq("season_id", sid)
      .eq("team_id", teamId)
      .order("seen_at", { ascending: false });
    if (r.error) throw new Error(r.error.message);
    return r.data.map((m) => ({
      fantasyId: m.fantasy_player_id,
      playerId: m.player_id,
      name: m.name,
      pos: m.pos as RosterMove["pos"],
      move: m.move as RosterMove["move"],
      seenMatchday: m.seen_matchday,
      seenAt: m.seen_at,
    }));
  } catch (e) {
    console.error(`[dunkest] cambi di rosa non disponibili: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
