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
      if (player.yearsLeft === null) continue; // durata da fissare: nessuna scadenza
      const end = endSeason(currentYear, player.yearsLeft);
      if (f.season !== null && end !== f.season) continue;
      out.push({ teamId: t.team.id, teamName: t.team.name, player, endSeason: end, optionSeason: player.teamOption ? end + 1 : null });
    }
  }
  return out.sort(
    (a, b) => a.endSeason - b.endSeason || a.teamName.localeCompare(b.teamName) || b.player.salary - a.player.salary,
  );
}

export interface ExpiringSummary {
  salary: number;
  options: number;
  starters: number;
  reserves: number;
}

export function summarizeExpiring(rows: ExpiringContract[]): ExpiringSummary {
  const summary = rows.reduce<ExpiringSummary>((total, row) => ({
    salary: total.salary + row.player.salary,
    options: total.options + (row.optionSeason === null ? 0 : 1),
    starters: total.starters + (row.player.slot === "starter" ? 1 : 0),
    reserves: total.reserves + (row.player.slot === "reserve" ? 1 : 0),
  }), { salary: 0, options: 0, starters: 0, reserves: 0 });
  return { ...summary, salary: Math.round(summary.salary * 10) / 10 };
}

export function parseExpiringFilters(sp: Record<string, string | string[] | undefined>): ExpiringFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const season = Number(one("stagione"));
  return { teamId: one("squadra"), season: Number.isInteger(season) && season > 0 ? season : null };
}
