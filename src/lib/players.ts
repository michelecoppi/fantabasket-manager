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
  /** R-35: squadra che lo ha nella squadra talenti (talento collegato al listone): non è libero, lo firma solo lei. */
  talentTeamId: string | null;
  cutByTeamId: string | null;
  /** R-23: squadra che può pareggiare l'offerta più alta per un restricted (ex contratto scaduto a fine stagione). */
  restrictedTeamId: string | null;
  /** R-25: ultimo contratto (riga più recente di last_contracts), da cui il minimo d'asta. */
  lastContract: LastContract | null;
  /** Punteggio Dunkest medio (issue #68), aggiunto dalla pagina dai dati del job; null = nessuna partita. */
  pdk?: number | null;
}

export type OwnerFilter = "all" | "free" | "open" | "cut" | "restricted" | "taken" | "talent";
export type PlayerStatus = "taken" | "talent" | "cut" | "restricted" | "free";
export type SortKey = "credits" | "name" | "pdk";
export type SortDir = "asc" | "desc";

export interface PlayerFilters {
  q: string;
  /** Ruoli ammessi; vuoto = tutti. */
  pos: Position[];
  nbaTeam: string;
  owner: OwnerFilter;
  sort: SortKey;
  dir: SortDir;
}

/** Righe mostrate per volta: la prima schermata e ogni caricamento successivo dello scroll infinito. */
export const PAGE_SIZE = 50;

/**
 * Default dei filtri senza parametri in URL: tutti gli stati, ordinati per punteggio Dunkest.
 * Non per crediti: chi è in rosa non ha crediti nel listone (null) e finirebbe in fondo, dopo le pagine dei liberi.
 * Senza dati Dunkest `pdk` è assente per tutti e l'ordine ricade sui crediti.
 */
export const DEFAULT_OWNER: OwnerFilter = "all";
export const DEFAULT_SORT: SortKey = "pdk";
/** Verso naturale: i numeri dal maggiore, il nome da A a Z. Fuori dall'URL se è questo. */
export const naturalDir = (s: SortKey): SortDir => (s === "name" ? "asc" : "desc");

/** Stati mutuamente esclusivi: in rosa, talento (R-35), tagliato (in asta), restricted (R-23), libero senza vincoli. */
export function playerStatus(p: PlayerListItem): PlayerStatus {
  if (p.ownerTeamId) return "taken";
  if (p.talentTeamId) return "talent";
  if (p.cutByTeamId) return "cut";
  if (p.restrictedTeamId) return "restricted";
  return "free";
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterPlayers(all: PlayerListItem[], f: PlayerFilters): PlayerListItem[] {
  const q = norm(f.q);
  const out = all.filter((p) => {
    if (q && !norm(p.name).includes(q)) return false;
    if (f.pos.length && (!p.pos || !f.pos.includes(p.pos))) return false;
    if (f.nbaTeam && p.nbaTeam !== f.nbaTeam) return false;
    // "free" = senza contratto né squadra talenti (include tagliati e restricted); gli altri filtri sono uno stato preciso.
    if (f.owner === "free" && (p.ownerTeamId || p.talentTeamId)) return false;
    if (f.owner !== "all" && f.owner !== "free" && playerStatus(p) !== (f.owner === "open" ? "free" : f.owner)) return false;
    return true;
  });
  const sign = f.dir === "asc" ? 1 : -1;
  const byName = (a: PlayerListItem, b: PlayerListItem) => a.name.localeCompare(b.name, "it") || a.id - b.id;
  // chi non ha il valore (nessuna partita, nessun credito) resta in fondo, in entrambi i versi
  const byNumber = (get: (p: PlayerListItem) => number | null | undefined) => (a: PlayerListItem, b: PlayerListItem) => {
    const x = get(a);
    const y = get(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return (x - y) * sign;
  };
  const byCredits = byNumber((p) => p.credits);
  const byPdk = byNumber((p) => p.pdk);
  return out.sort((a, b) =>
    f.sort === "name"
      ? byName(a, b) * sign
      : f.sort === "pdk"
        ? byPdk(a, b) || byCredits(a, b) || byName(a, b)
        : byCredits(a, b) || byName(a, b),
  );
}

/** URL del listone per questi filtri: i valori di default non compaiono. */
export function filtersHref(f: PlayerFilters): string {
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  for (const r of f.pos) qs.append("ruolo", r);
  if (f.nbaTeam) qs.set("nba", f.nbaTeam);
  if (f.owner !== DEFAULT_OWNER) qs.set("stato", f.owner);
  if (f.sort !== DEFAULT_SORT) qs.set("ordina", f.sort);
  if (f.dir !== naturalDir(f.sort)) qs.set("dir", f.dir);
  const s = qs.toString();
  return s ? `/giocatori?${s}` : "/giocatori";
}

/** Legge i filtri dai parametri URL ignorando valori non validi. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): PlayerFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const owner = one("stato");
  const sortParam = one("ordina");
  const sort: SortKey = sortParam === "name" || sortParam === "credits" || sortParam === "pdk" ? sortParam : DEFAULT_SORT;
  const dir = one("dir");
  // ruolo si ripete nell'URL (?ruolo=G&ruolo=A): una casella per ruolo
  const roles = [sp.ruolo ?? []].flat();
  return {
    q: one("q").slice(0, 60),
    pos: (["G", "A", "C"] as const).filter((r) => roles.includes(r)),
    nbaTeam: one("nba").slice(0, 40), // nome intero ("Golden State Warriors")
    owner: owner === "all" || owner === "free" || owner === "open" || owner === "cut" || owner === "restricted" || owner === "taken" || owner === "talent" ? owner : DEFAULT_OWNER,
    sort,
    dir: dir === "asc" || dir === "desc" ? dir : naturalDir(sort),
  };
}
