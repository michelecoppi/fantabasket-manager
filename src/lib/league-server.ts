import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { buildLeague, type ContractRow, type CutRow, type RawLeague, type LeagueView } from "./league";

const playerCols = "players(first_name,last_name,pos,nba_team)";

/** Carica la lega della stagione corrente come l'utente loggato (le policy RLS decidono cosa vede). */
export const loadLeague = cache(async (): Promise<LeagueView> => {
  const db = await createClient();
  const season = await db.from("seasons").select("id,year").eq("is_current", true).maybeSingle<{ id: number; year: number }>();
  if (season.error || !season.data) throw new Error("Stagione corrente non trovata");
  const sid = season.data.id;

  const [teams, settings, contracts, cuts, talents, picks, teamSeason, rookie] = await Promise.all([
    db.from("teams").select("id,name,owner_name").order("name"),
    db.from("league_settings").select("key,value").eq("season_id", sid),
    db.from("contracts").select(`id,team_id,slot,years_left,team_option,salary,restriction,${playerCols}`).eq("season_id", sid),
    db.from("cuts").select(`id,team_id,paid_salary,years_left,${playerCols}`).eq("season_id", sid),
    db.from("talents").select("id,team_id,display_name,draft_year,entry_credits,notes"),
    db.from("draft_picks").select("id,year,round,original_team_id,current_team_id,to_confirm,note").order("year").order("round"),
    db.from("team_season").select("team_id,bonus,final_rank,entry_fee_paid,luxury_tax_paid").eq("season_id", sid),
    db.from("rookie_draft").select("pick_no,team_id,note").eq("season_id", sid),
  ]);
  for (const r of [teams, settings, contracts, cuts, talents, picks, teamSeason, rookie]) {
    if (r.error) throw new Error(r.error.message);
  }

  const raw: RawLeague = {
    seasonYear: season.data.year,
    teams: teams.data ?? [],
    settings: settings.data ?? [],
    contracts: (contracts.data ?? []) as unknown as ContractRow[],
    cuts: (cuts.data ?? []) as unknown as CutRow[],
    talents: talents.data ?? [],
    picks: picks.data ?? [],
    teamSeason: teamSeason.data ?? [],
    rookieDraft: rookie.data ?? [],
  };
  return buildLeague(raw);
});

/** Profilo dell'utente loggato (ruolo e squadra). */
export const loadProfile = cache(async () => {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db
    .from("profiles")
    .select("display_name,role,team_id")
    .eq("id", auth.user.id)
    .maybeSingle<{ display_name: string; role: "admin" | "viewer"; team_id: string | null }>();
  return { email: auth.user.email ?? "", ...(data ?? { display_name: auth.user.email ?? "", role: "viewer" as const, team_id: null }) };
});
