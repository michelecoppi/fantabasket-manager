// Contratti in scadenza: per ogni contratto, la stagione in cui finisce (puro, testabile).
import type { TeamView, RosterPlayer } from "./league";

export interface ExpiringContract {
  teamId: string;
  teamName: string;
  player: RosterPlayer;
  /** anno della stagione corrente + durata residua arrotondata per eccesso - 1 (0.5 e 1 → stagione corrente) */
  endSeason: number;
  /** con team option la scadenza può slittare di una stagione (R-22) */
  optionSeason: number | null;
}

export function endSeason(currentYear: number, yearsLeft: number): number {
  return currentYear + Math.max(Math.ceil(yearsLeft), 1) - 1;
}

export interface ExpiringFilters {
  teamId: string;
  /** "" = tutte le stagioni */
  season: number | null;
}

export function expiringContracts(teams: TeamView[], currentYear: number, f: ExpiringFilters): ExpiringContract[] {
  const out: ExpiringContract[] = [];
  for (const t of teams) {
    if (f.teamId && t.team.id !== f.teamId) continue;
    for (const player of [...t.starters, ...t.reserves]) {
      const end = endSeason(currentYear, player.yearsLeft);
      if (f.season !== null && end !== f.season) continue;
      out.push({ teamId: t.team.id, teamName: t.team.name, player, endSeason: end, optionSeason: player.teamOption ? end + 1 : null });
    }
  }
  return out.sort(
    (a, b) => a.endSeason - b.endSeason || a.teamName.localeCompare(b.teamName) || b.player.salary - a.player.salary,
  );
}

export function parseExpiringFilters(sp: Record<string, string | string[] | undefined>): ExpiringFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const season = Number(one("stagione"));
  return { teamId: one("squadra"), season: Number.isInteger(season) && season > 0 ? season : null };
}
