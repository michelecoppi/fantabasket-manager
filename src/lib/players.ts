// Listone giocatori Dunkest: filtri e ordinamento (puri, testabili).
import type { LastContract, Position } from "./cap";

export interface PlayerListItem {
  id: number;
  name: string;
  pos: Position | null;
  nbaTeam: string | null;
  credits: number | null;
  /** Squadra della lega che lo ha a contratto nella stagione corrente. */
  ownerTeamId: string | null;
  cutByTeamId: string | null;
  /** R-23: squadra che può pareggiare l'offerta più alta per un restricted (ex contratto scaduto a fine stagione). */
  restrictedTeamId: string | null;
  /** R-25: ultimo contratto (riga più recente di last_contracts), da cui il minimo d'asta. */
  lastContract: LastContract | null;
}

export type OwnerFilter = "all" | "free" | "taken";
export type SortKey = "credits" | "name";

export interface PlayerFilters {
  q: string;
  pos: Position | "";
  nbaTeam: string;
  owner: OwnerFilter;
  sort: SortKey;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterPlayers(all: PlayerListItem[], f: PlayerFilters): PlayerListItem[] {
  const q = norm(f.q);
  const out = all.filter((p) => {
    if (q && !norm(p.name).includes(q)) return false;
    if (f.pos && p.pos !== f.pos) return false;
    if (f.nbaTeam && p.nbaTeam !== f.nbaTeam) return false;
    if (f.owner === "free" && p.ownerTeamId) return false;
    if (f.owner === "taken" && !p.ownerTeamId) return false;
    return true;
  });
  return out.sort((a, b) =>
    f.sort === "name"
      ? a.name.localeCompare(b.name, "it")
      : (b.credits ?? -1) - (a.credits ?? -1) || a.name.localeCompare(b.name, "it"),
  );
}

/** Legge i filtri dai parametri URL ignorando valori non validi. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): PlayerFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const pos = one("ruolo");
  const owner = one("stato");
  return {
    q: one("q").slice(0, 60),
    pos: pos === "G" || pos === "A" || pos === "C" ? pos : "",
    nbaTeam: one("nba").slice(0, 5),
    owner: owner === "free" || owner === "taken" ? owner : "all",
    sort: one("ordina") === "name" ? "name" : "credits",
  };
}
