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
  /** Punteggio Dunkest medio (issue #68), aggiunto dalla pagina dai dati del job; null = nessuna partita. */
  pdk?: number | null;
}

export type OwnerFilter = "all" | "free" | "open" | "cut" | "restricted" | "taken";
export type PlayerStatus = "taken" | "cut" | "restricted" | "free";
export type SortKey = "credits" | "name" | "pdk";

export interface PlayerFilters {
  q: string;
  pos: Position | "";
  nbaTeam: string;
  owner: OwnerFilter;
  sort: SortKey;
  /** Pagina 1-based. */
  page?: number;
}

export const PAGE_SIZE = 50;

/** Stati mutuamente esclusivi: in rosa, tagliato (in asta), restricted (R-23), libero senza vincoli. */
export function playerStatus(p: PlayerListItem): PlayerStatus {
  if (p.ownerTeamId) return "taken";
  if (p.cutByTeamId) return "cut";
  if (p.restrictedTeamId) return "restricted";
  return "free";
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterPlayers(all: PlayerListItem[], f: PlayerFilters): PlayerListItem[] {
  const q = norm(f.q);
  const out = all.filter((p) => {
    if (q && !norm(p.name).includes(q)) return false;
    if (f.pos && p.pos !== f.pos) return false;
    if (f.nbaTeam && p.nbaTeam !== f.nbaTeam) return false;
    // "free" = senza contratto (include tagliati e restricted); gli altri filtri sono uno stato preciso.
    if (f.owner === "free" && p.ownerTeamId) return false;
    if (f.owner !== "all" && f.owner !== "free" && playerStatus(p) !== (f.owner === "open" ? "free" : f.owner)) return false;
    return true;
  });
  const byCredits = (a: PlayerListItem, b: PlayerListItem) => (b.credits ?? -1) - (a.credits ?? -1) || a.name.localeCompare(b.name, "it") || a.id - b.id;
  return out.sort((a, b) =>
    f.sort === "name"
      ? a.name.localeCompare(b.name, "it") || a.id - b.id
      : f.sort === "pdk"
        ? (b.pdk ?? -Infinity) - (a.pdk ?? -Infinity) || byCredits(a, b) // chi non ha giocato in fondo
        : byCredits(a, b),
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
    owner: owner === "free" || owner === "open" || owner === "cut" || owner === "restricted" || owner === "taken" ? owner : "all",
    sort: one("ordina") === "name" ? "name" : one("ordina") === "pdk" ? "pdk" : "credits",
    page: Math.max(1, Math.min(Math.floor(Number(one("pagina"))) || 1, 1000)),
  };
}
