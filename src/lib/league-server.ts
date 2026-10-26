import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { LastContract } from "./cap";
import type { PlayerListItem } from "./players";
import { buildLeague, playerName, type ContractRow, type CutRow, type RawLeague, type LeagueView, type Versions } from "./league";
import { resolveProfile } from "./profile";
import type { CloseInput } from "./season-close";

const playerCols = "players(first_name,last_name,pos,nba_team)";

const PAGE = 1000; // PostgREST (Supabase) taglia a max_rows = 1000 per richiesta, anche con .limit(2000)

async function fetchAllPlayers(db: Awaited<ReturnType<typeof createClient>>) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const r = await db
      .from("players")
      .select("id,first_name,last_name,pos,nba_team,dunkest_credits")
      .order("last_name")
      .order("id") // ordine stabile tra una pagina e l'altra
      .range(from, from + PAGE - 1);
    if (r.error) throw new Error(r.error.message);
    rows.push(...r.data);
    if (r.data.length < PAGE) return rows;
  }
}

/** Stagione corrente: una sola query per richiesta, condivisa da tutti i loader. */
const loadSeason = cache(async (): Promise<{ id: number; year: number }> => {
  const db = await createClient();
  const season = await db.from("seasons").select("id,year").eq("is_current", true).maybeSingle<{ id: number; year: number }>();
  if (season.error || !season.data) throw new Error("Stagione corrente non trovata");
  return season.data;
});

/**
 * Lega della stagione corrente come l'utente loggato (le policy RLS decidono cosa vede), più le versioni delle righe
 * modificabili dagli admin (migrazioni 0006-0007) per la concorrenza ottimistica delle RPC: stesse righe, una sola lettura.
 */
const loadLeagueData = cache(async () => {
  const db = await createClient();
  const season = await loadSeason();
  const sid = season.id;

  const [teams, settings, contracts, cuts, talents, picks, teamSeason, rookie] = await Promise.all([
    db.from("teams").select("id,name,owner_name").order("name"),
    db.from("league_settings").select("key,value").eq("season_id", sid),
    db.from("contracts").select(`id,version,team_id,slot,years_left,team_option,salary,restriction,is_rookie,${playerCols}`).eq("season_id", sid),
    db
      .from("cuts")
      .select(`id,version,team_id,player_id,status,paid_salary,years_left,original_salary,original_slot,original_is_rookie,team_option,${playerCols}`)
      .eq("season_id", sid)
      .in("status", ["pending", "cut"]), // rientrati e assegnati non pesano più sul monte ingaggi
    db.from("talents").select("id,team_id,display_name,draft_year,entry_credits,notes"),
    db.from("draft_picks").select("id,version,year,round,original_team_id,current_team_id,to_confirm,note").order("year").order("round"),
    db.from("team_season").select("team_id,version,bonus,final_rank,entry_fee_paid,luxury_tax_paid").eq("season_id", sid),
    db.from("rookie_draft").select("pick_no,team_id,original_team_id,note").eq("season_id", sid),
  ]);
  for (const r of [teams, settings, contracts, cuts, talents, picks, teamSeason, rookie]) {
    if (r.error) throw new Error(r.error.message);
  }

  const raw: RawLeague = {
    seasonYear: season.year,
    teams: teams.data ?? [],
    settings: settings.data ?? [],
    contracts: (contracts.data ?? []) as unknown as ContractRow[],
    cuts: (cuts.data ?? []) as unknown as CutRow[],
    talents: talents.data ?? [],
    picks: picks.data ?? [],
    teamSeason: teamSeason.data ?? [],
    rookieDraft: rookie.data ?? [],
  };
  const toMap = (rows: { id: number; version: number }[] | null) => Object.fromEntries((rows ?? []).map((r) => [r.id, r.version]));
  const versions: Versions = { contracts: toMap(contracts.data), picks: toMap(picks.data), cuts: toMap(cuts.data),
    teamSeason: Object.fromEntries((teamSeason.data ?? []).map((r) => [r.team_id, r.version])),
  };
  return { league: buildLeague(raw), versions };
});

export const loadLeague = async (): Promise<LeagueView> => (await loadLeagueData()).league;
export const loadVersions = async (): Promise<Versions> => (await loadLeagueData()).versions;

/** Tutto ciò che serve a `planSeasonClose`: contratti (con versione) e tagli della stagione corrente, pick e luxury tax di adesso. */
export const loadCloseInput = cache(async (): Promise<CloseInput> => {
  const db = await createClient();
  const [season, league] = await Promise.all([loadSeason(), loadLeague()]);
  const [contracts, cuts] = await Promise.all([
    db.from("contracts").select(`id,version,team_id,years_left,team_option,is_rookie,restriction,${playerCols}`).eq("season_id", season.id),
    db.from("cuts").select(`id,version,team_id,status,years_left,${playerCols}`).eq("season_id", season.id).in("status", ["pending", "cut"]),
  ]);
  for (const r of [contracts, cuts]) if (r.error) throw new Error(r.error.message);

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

  const [players, contracts, cuts, restricted] = await Promise.all([
    fetchAllPlayers(db),
    db.from("contracts").select("player_id,team_id").eq("season_id", sid),
    db.from("cuts").select("player_id,team_id").eq("season_id", sid).in("status", ["pending", "cut"]),
    // In ordine di data: conta solo l'ultima scadenza di ogni giocatore (una successiva unrestricted cancella il diritto, R-24).
    db.from("last_contracts").select("player_id,team_id,restricted,salary,last_contract_on").order("last_contract_on").order("id"),
  ]);
  for (const r of [contracts, cuts, restricted]) if (r.error) throw new Error(r.error.message);

  const owner = new Map((contracts.data ?? []).map((c) => [c.player_id as number, c.team_id as string]));
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
