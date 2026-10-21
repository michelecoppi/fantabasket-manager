import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PlayerListItem } from "./players";
import { buildLeague, type ContractRow, type CutRow, type RawLeague, type LeagueView } from "./league";

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
 * modificabili dagli admin (migrazione 0006) per la concorrenza ottimistica delle RPC: stesse righe, una sola lettura.
 */
const loadLeagueData = cache(async () => {
  const db = await createClient();
  const season = await loadSeason();
  const sid = season.id;

  const [teams, settings, contracts, cuts, talents, picks, teamSeason, rookie] = await Promise.all([
    db.from("teams").select("id,name,owner_name").order("name"),
    db.from("league_settings").select("key,value").eq("season_id", sid),
    db.from("contracts").select(`id,version,team_id,slot,years_left,team_option,salary,restriction,is_rookie,${playerCols}`).eq("season_id", sid),
    db.from("cuts").select(`id,team_id,paid_salary,years_left,${playerCols}`).eq("season_id", sid),
    db.from("talents").select("id,team_id,display_name,draft_year,entry_credits,notes"),
    db.from("draft_picks").select("id,version,year,round,original_team_id,current_team_id,to_confirm,note").order("year").order("round"),
    db.from("team_season").select("team_id,bonus,final_rank,entry_fee_paid,luxury_tax_paid").eq("season_id", sid),
    db.from("rookie_draft").select("pick_no,team_id,note").eq("season_id", sid),
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
  return { league: buildLeague(raw), versions: { contracts: toMap(contracts.data), picks: toMap(picks.data) } };
});

export const loadLeague = async (): Promise<LeagueView> => (await loadLeagueData()).league;
export const loadVersions = async () => (await loadLeagueData()).versions;

/** Profilo dell'utente loggato (ruolo e squadra). */
export const loadProfile = cache(async () => {
  const db = await createClient();
  // getClaims verifica il JWT in locale (chiavi asimmetriche ES256): niente giro di rete verso Auth. L'identità conta solo qui;
  // i permessi veri restano nel database (RLS e is_admin() leggono lo stesso JWT).
  const { data: auth } = await db.auth.getClaims();
  const claims = auth?.claims;
  if (!claims) return null;
  const email = typeof claims.email === "string" ? claims.email : "";
  const { data } = await db
    .from("profiles")
    .select("display_name,role,team_id")
    .eq("id", claims.sub)
    .maybeSingle<{ display_name: string; role: "admin" | "viewer"; team_id: string | null }>();
  return { email, ...(data ?? { display_name: email, role: "viewer" as const, team_id: null }) };
});

/** Listone Dunkest con l'eventuale proprietario nella stagione corrente. */
export const loadPlayers = cache(async (): Promise<PlayerListItem[]> => {
  const db = await createClient();
  const sid = (await loadSeason()).id;

  const [players, contracts, cuts] = await Promise.all([
    fetchAllPlayers(db),
    db.from("contracts").select("player_id,team_id").eq("season_id", sid),
    db.from("cuts").select("player_id,team_id").eq("season_id", sid),
  ]);
  for (const r of [contracts, cuts]) if (r.error) throw new Error(r.error.message);

  const owner = new Map((contracts.data ?? []).map((c) => [c.player_id as number, c.team_id as string]));
  const cutBy = new Map((cuts.data ?? []).map((c) => [c.player_id as number, c.team_id as string]));
  return players.map((p) => ({
    id: p.id as number,
    name: `${p.first_name ?? ""} ${p.last_name}`.trim(),
    pos: p.pos as PlayerListItem["pos"],
    nbaTeam: p.nba_team as string | null,
    credits: p.dunkest_credits === null ? null : Number(p.dunkest_credits),
    ownerTeamId: owner.get(p.id as number) ?? null,
    cutByTeamId: cutBy.get(p.id as number) ?? null,
  }));
});
