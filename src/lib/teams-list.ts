// Ordinamento e filtri delle squadre nella home (puri, testabili).
import type { TeamView } from "./league";

export type TeamSort = "nome" | "monte" | "spazio";
export type TeamFilter = "tutte" | "sforate" | "floor" | "incomplete";

export interface TeamListOptions {
  sort: TeamSort;
  filter: TeamFilter;
}

const SORTS: TeamSort[] = ["nome", "monte", "spazio"];
const FILTERS: TeamFilter[] = ["tutte", "sforate", "floor", "incomplete"];

export function parseTeamListOptions(sp: Record<string, string | string[] | undefined>): TeamListOptions {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const sort = one("ordina") as TeamSort;
  const filter = one("mostra") as TeamFilter;
  return { sort: SORTS.includes(sort) ? sort : "nome", filter: FILTERS.includes(filter) ? filter : "tutte" };
}

export function listTeams(teams: TeamView[], o: TeamListOptions): TeamView[] {
  const kept = teams.filter((t) => {
    if (o.filter === "sforate") return t.finance.overCap;
    if (o.filter === "floor") return t.finance.belowFloor;
    if (o.filter === "incomplete") return t.warnings.length > 0;
    return true;
  });
  const byName = (a: TeamView, b: TeamView) => a.team.name.localeCompare(b.team.name);
  return [...kept].sort((a, b) => {
    if (o.sort === "monte") return b.finance.payroll - a.finance.payroll || byName(a, b);
    if (o.sort === "spazio") return b.finance.capSpace - a.finance.capSpace || byName(a, b);
    return byName(a, b);
  });
}
