// Dati Dunkest (issue #68): lettura delle fonti, collegamento ai giocatori della lega, vista per le pagine. Tutto puro e testato;
// le richieste di rete stanno in dunkest-sync.ts, che gira solo nel job giornaliero (le pagine leggono dal database).
import type { Position } from "./cap";
import { lettersOnly } from "./text";

// ---------- Fonti (endpoint interni di dunkest.com, non documentati: verificati il 2026-10-27) ----------

/** Medie stagionali di tutti i giocatori che hanno giocato almeno una partita. `max_cr=35`: il più caro oggi vale 29,5. */
export function dunkestStatsUrl(dunkestSeasonId: number): string {
  return (
    `https://www.dunkest.com/api/stats/table?season_id=${dunkestSeasonId}&mode=nba&stats_type=avg&date_from=2000-01-01&date_to=2100-01-01` +
    "&positions[]=1&positions[]=2&positions[]=3&player_search=&min_cr=0&max_cr=35&sort_by=pdk&sort_order=desc"
  );
}
export const DUNKEST_INJURIES_URL = "https://www.dunkest.com/it/nba/infortuni";

/** Dunkest scrive "LA Clippers", il listone (players.nba_team) "Los Angeles Clippers". Come in fetch-dunkest-players.ts. */
const TEAM_NAMES: Record<string, string> = { "LA Clippers": "Los Angeles Clippers" };

export interface SourceStat {
  dunkestId: number;
  firstName: string;
  lastName: string;
  teamCode: string;
  teamName: string;
  /** ruolo come nel listone (G/A/C): Dunkest scrive G/F/C */
  pos: Position | null;
  /** crediti Dunkest di oggi; null se Dunkest scrive 0 (non ancora prezzato) */
  credits: number | null;
  gp: number;
  pdk: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
}

export interface SourceInjury {
  dunkestId: number;
  /** "mouhamed-gueye": il nome intero, che nella tabella è abbreviato ("M. Gueye") */
  slug: string;
  shortName: string;
  teamCode: string;
  /** AAAA-MM-GG */
  date: string | null;
  injury: string;
  description: string;
}

/** Errore di formato: la fonte ha risposto ma non come ci aspettiamo. Il job non scrive nulla e registra il motivo. */
export class SourceFormatError extends Error {}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

const POS: Record<string, Position> = { G: "G", F: "A", C: "C" };

/** Righe di `/api/stats/table` (valori quasi tutti stringhe). Lancia se la forma non è quella attesa. */
export function parseStats(json: unknown): SourceStat[] {
  if (!Array.isArray(json)) throw new SourceFormatError("statistiche: la risposta non è una lista");
  if (json.length === 0) throw new SourceFormatError("statistiche: lista vuota");
  const out: SourceStat[] = [];
  for (const r of json as Record<string, unknown>[]) {
    const s: SourceStat = {
      dunkestId: num(r?.id),
      firstName: String(r?.first_name ?? "").trim(),
      lastName: String(r?.last_name ?? "").trim(),
      teamCode: String(r?.team_code ?? "").trim(),
      teamName: TEAM_NAMES[String(r?.team_name ?? "").trim()] ?? String(r?.team_name ?? "").trim(),
      pos: POS[String(r?.position ?? "").trim()] ?? null,
      credits: num(r?.cr) > 0 ? num(r?.cr) : null,
      gp: num(r?.gp),
      pdk: num(r?.pdk),
      min: num(r?.min),
      pts: num(r?.pts),
      reb: num(r?.reb),
      ast: num(r?.ast),
    };
    if (!Number.isInteger(s.dunkestId) || !s.lastName || !Number.isFinite(s.gp) || !Number.isFinite(s.pdk)) {
      throw new SourceFormatError(`statistiche: riga senza id, nome, gp o pdk (${JSON.stringify(r).slice(0, 120)})`);
    }
    for (const k of ["min", "pts", "reb", "ast"] as const) if (!Number.isFinite(s[k])) s[k] = 0;
    out.push(s);
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Pagina `/it/nba/infortuni`: legge solo la vista "per squadra" (la stessa lista compare anche "per giorno").
 * Ogni riga: link `/it/giocatore/<id>/<slug>`, ruolo, crediti, data (`data-date`), infortunio, descrizione.
 * Lancia se la vista non c'è più; una vista presente ma senza righe vuol dire nessun infortunato.
 */
export function parseInjuries(html: string): { updatedAt: string | null; injuries: SourceInjury[] } {
  const start = html.search(/<div[^>]*class="[^"]*injuries__wrapper[^"]*"[^>]*data-target="by-team"/);
  if (start < 0) throw new SourceFormatError("infortuni: vista per squadra non trovata");
  const next = html.slice(start + 1).search(/<div[^>]*class="[^"]*injuries__wrapper[^"]*"/);
  const section = next < 0 ? html.slice(start) : html.slice(start, start + 1 + next);

  const updated = /id="lastUpdateDateTime"[^>]*?datetime="([^"]+)"/.exec(html)?.[1] ?? null;
  const byId = new Map<number, SourceInjury>();
  for (const article of section.split(/<article\b/).slice(1)) {
    const teamCode = /data-team-code="([^"]*)"/.exec(article)?.[1] ?? "";
    for (const row of article.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      if (cells.length === 0) continue; // intestazione
      const link = /href="[^"]*\/giocatore\/(\d+)\/([^"/?#]+)"/.exec(cells[0] ?? "");
      if (!link || cells.length < 6) throw new SourceFormatError(`infortuni: riga inattesa (${text(row[1]).slice(0, 80)})`);
      const id = Number(link[1]);
      if (byId.has(id)) continue;
      const description = text(cells[5]);
      byId.set(id, {
        dunkestId: id,
        slug: link[2],
        shortName: text(cells[0]),
        teamCode,
        date: /data-date="(\d{4}-\d{2}-\d{2})"/.exec(cells[3])?.[1] ?? null,
        injury: text(cells[4]),
        description: description === "—" || description === "-" ? "" : description,
      });
    }
  }
  return { updatedAt: updated, injuries: [...byId.values()] };
}

// ---------- Collegamento ai giocatori della lega ----------

export interface DbPlayer {
  id: number;
  firstName: string;
  lastName: string;
  nbaTeam: string | null;
  dunkestId: number | null;
  /** a contratto in una squadra della lega nella stagione corrente */
  rostered: boolean;
}

export interface LinkSource {
  dunkestId: number;
  /** nome intero ("Jaime Jaquez Jr.") o slug ("jaime-jaquez-jr"): conta solo dopo `lettersOnly` */
  name: string;
  /** squadra NBA per esteso, per distinguere gli omonimi */
  team: string | null;
  /** come mostrarlo nel report */
  label: string;
}

/** Report del collegamento (salvato in `dunkest_sync.report`, mostrato agli admin). Mai indovinare: chi è dubbio resta qui. */
export interface LinkReport {
  /** giocatori della lega con solo il cognome (provvisori): mai collegati in automatico */
  provisional: string[];
  /** voci Dunkest che combaciano con più giocatori della lega, anche guardando la squadra */
  ambiguous: { source: string; candidates: string[] }[];
  /** giocatori in rosa che non compaiono né tra le statistiche né tra gli infortuni (non hanno ancora giocato, o nome diverso) */
  rosteredWithoutStats: string[];
  /** infortunati Dunkest senza un giocatore della lega con lo stesso nome */
  injuriesUnlinked: string[];
  /** giocatori nuovi aggiunti al listone in questa esecuzione (assente nei report più vecchi) */
  added?: string[];
}

const SUFFIX = /(jr|sr|ii|iii|iv)$/;
const fullKey = (s: string) => lettersOnly(s);
const looseKey = (first: string, last: string) => lettersOnly(first) + lettersOnly(last).replace(SUFFIX, "");
const dbName = (p: DbPlayer) => (p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName);

/**
 * Collega le voci Dunkest ai giocatori: prima l'id già salvato (`players.dunkest_id`), poi il nome intero, poi il nome senza
 * suffisso (Jr., III). Più candidati: decide la squadra NBA, se ne resta uno solo. Restituisce id Dunkest → id giocatore e i
 * collegamenti nuovi da salvare.
 */
export function linkPlayers(players: DbPlayer[], sources: LinkSource[]): { links: Map<number, number>; newLinks: { playerId: number; dunkestId: number }[]; ambiguous: LinkReport["ambiguous"]; unlinked: LinkSource[] } {
  const links = new Map<number, number>();
  const taken = new Set<number>();
  for (const p of players) {
    if (p.dunkestId !== null) {
      links.set(p.dunkestId, p.id);
      taken.add(p.id);
    }
  }
  // Candidati: chi non ha ancora un id Dunkest e ha il nome intero.
  const free = players.filter((p) => p.dunkestId === null && p.firstName.trim() !== "");
  const index = (key: (p: DbPlayer) => string) => {
    const m = new Map<string, DbPlayer[]>();
    for (const p of free) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
    return m;
  };
  const byFull = index((p) => fullKey(p.firstName + p.lastName));
  const byLoose = index((p) => looseKey(p.firstName, p.lastName));

  const pending = new Map<number, LinkSource>();
  for (const s of sources) if (!links.has(s.dunkestId) && !pending.has(s.dunkestId)) pending.set(s.dunkestId, s);
  // Due voci Dunkest con lo stesso nome: nessuna delle due si collega senza la squadra.
  const sameName = new Map<string, number>();
  for (const s of pending.values()) sameName.set(fullKey(s.name), (sameName.get(fullKey(s.name)) ?? 0) + 1);

  const newLinks: { playerId: number; dunkestId: number }[] = [];
  const ambiguous: LinkReport["ambiguous"] = [];
  const unlinked: LinkSource[] = [];
  for (const s of pending.values()) {
    const key = fullKey(s.name);
    let cands = (byFull.get(key) ?? []).filter((p) => !taken.has(p.id));
    if (cands.length === 0) cands = (byLoose.get(key.replace(SUFFIX, "")) ?? []).filter((p) => !taken.has(p.id));
    if (cands.length === 0) {
      unlinked.push(s);
      continue;
    }
    const team = s.team ? lettersOnly(s.team) : null;
    const pick = cands.length === 1 && (sameName.get(key) ?? 0) <= 1 ? cands : cands.filter((p) => team !== null && lettersOnly(p.nbaTeam ?? "") === team);
    if (pick.length !== 1) {
      ambiguous.push({ source: s.label, candidates: cands.map((p) => `${dbName(p)} (${p.nbaTeam ?? "NBA n.d."})`) });
      continue;
    }
    links.set(s.dunkestId, pick[0].id);
    taken.add(pick[0].id);
    newLinks.push({ playerId: pick[0].id, dunkestId: s.dunkestId });
  }
  return { links, newLinks, ambiguous, unlinked };
}

/** Giocatore di Dunkest che il listone non ha: lo aggiunge `dunkest_sync_add_players` prima di scrivere le statistiche. */
export interface NewPlayer {
  dunkest_id: number;
  first_name: string;
  last_name: string;
  pos: Position | null;
  nba_team: string;
  dunkest_credits: number | null;
}

/** Oltre questa soglia in un colpo solo la fonte è probabilmente cambiata (nomi diversi): non si aggiunge nessuno e il job fallisce. */
export const MAX_NEW_PLAYERS = 100;

/**
 * Chi ha giocato (è nelle statistiche) ma non ha nessun giocatore della lega con lo stesso nome o id: rookie e firme nuove.
 * Gli omonimi dubbi non si aggiungono (restano nel report) e neppure gli infortunati senza statistiche, di cui la pagina
 * infortuni dà solo il nome abbreviato.
 */
export function findNewPlayers(players: DbPlayer[], stats: SourceStat[]): NewPlayer[] {
  const sources: LinkSource[] = stats.map((s) => ({ dunkestId: s.dunkestId, name: `${s.firstName} ${s.lastName}`, team: s.teamName, label: s.lastName }));
  const missing = new Set(linkPlayers(players, sources).unlinked.map((s) => s.dunkestId));
  const seen = new Set<number>();
  const out: NewPlayer[] = [];
  for (const s of stats) {
    if (!missing.has(s.dunkestId) || seen.has(s.dunkestId) || !s.firstName || !s.teamName) continue;
    seen.add(s.dunkestId);
    out.push({ dunkest_id: s.dunkestId, first_name: s.firstName, last_name: s.lastName, pos: s.pos, nba_team: s.teamName, dunkest_credits: s.credits });
  }
  return out;
}

/** Payload della RPC `dunkest_sync_apply` (migrazione 20261027025827): tutto quello che il job scrive, in una transazione. */
export interface SyncPayload {
  season_id: number;
  links: { player_id: number; dunkest_id: number }[];
  stats: { player_id: number; gp: number; pdk: number; min: number; pts: number; reb: number; ast: number }[];
  injuries: { player_id: number; injured_on: string | null; injury: string; description: string }[];
  source_updated_at: string | null;
  report: LinkReport;
}

/** Dalle fonti già lette ai dati da scrivere. Le voci senza giocatore della lega restano fuori (e gli infortuni finiscono nel report). */
export function buildSyncPayload(
  seasonId: number,
  players: DbPlayer[],
  stats: SourceStat[],
  injuries: { updatedAt: string | null; injuries: SourceInjury[] },
  added: string[] = [],
): SyncPayload {
  const codeToTeam = new Map(stats.map((s) => [s.teamCode, s.teamName]));
  const sources: LinkSource[] = [
    ...stats.map((s) => ({ dunkestId: s.dunkestId, name: `${s.firstName} ${s.lastName}`, team: s.teamName, label: `${s.firstName} ${s.lastName} (${s.teamName})` })),
    ...injuries.injuries.map((i) => ({ dunkestId: i.dunkestId, name: i.slug, team: codeToTeam.get(i.teamCode) ?? null, label: `${i.shortName} (${i.teamCode})` })),
  ];
  const { links, newLinks, ambiguous, unlinked } = linkPlayers(players, sources);
  const statPlayers = new Set<number>();
  const statRows: SyncPayload["stats"] = [];
  for (const s of stats) {
    const pid = links.get(s.dunkestId);
    if (pid === undefined || statPlayers.has(pid)) continue;
    statPlayers.add(pid);
    statRows.push({ player_id: pid, gp: s.gp, pdk: s.pdk, min: s.min, pts: s.pts, reb: s.reb, ast: s.ast });
  }
  const injuryPlayers = new Set<number>();
  const injuryRows: SyncPayload["injuries"] = [];
  for (const i of injuries.injuries) {
    const pid = links.get(i.dunkestId);
    if (pid === undefined || injuryPlayers.has(pid)) continue;
    injuryPlayers.add(pid);
    injuryRows.push({ player_id: pid, injured_on: i.date, injury: i.injury, description: i.description });
  }
  const injuryIds = new Set(injuries.injuries.map((i) => i.dunkestId));
  const byName = (a: string, b: string) => a.localeCompare(b, "it");
  return {
    season_id: seasonId,
    links: newLinks.map((l) => ({ player_id: l.playerId, dunkest_id: l.dunkestId })),
    stats: statRows,
    injuries: injuryRows,
    source_updated_at: injuries.updatedAt,
    report: {
      provisional: players.filter((p) => p.firstName.trim() === "").map(dbName).sort(byName),
      ambiguous,
      // Chi è infortunato ha già il suo motivo: qui restano i casi da guardare.
      rosteredWithoutStats: players.filter((p) => p.rostered && !statPlayers.has(p.id) && !injuryPlayers.has(p.id)).map(dbName).sort(byName),
      injuriesUnlinked: unlinked.filter((s) => injuryIds.has(s.dunkestId)).map((s) => s.label).sort(byName),
      added: [...added].sort(byName),
    },
  };
}

// ---------- Vista per le pagine ----------

export interface PlayerStats {
  gp: number;
  pdk: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
}

/** "out" = indisponibile per un periodo, "doubtful" = GTD (da valutare prima della partita), "season" = stagione finita. */
export type InjuryStatus = "out" | "doubtful" | "season";

export interface Injury {
  status: InjuryStatus;
  injury: string;
  description: string;
  /** "20 nov": rientro previsto, se la descrizione lo dice */
  until: string | null;
  /** AAAA-MM-GG */
  since: string | null;
}

/** Stato dalla descrizione di Dunkest: "Indisponibile fino al 20 Nov", "GTD: da valutare…", "…per tutta la stagione". */
export function injuryStatus(description: string): { status: InjuryStatus; until: string | null } {
  const d = description.trim();
  if (/tutta la stagione|fine stagione/i.test(d)) return { status: "season", until: null };
  if (/^gtd\b|da valutare|in dubbio|day.to.day/i.test(d)) return { status: "doubtful", until: null };
  const until = /fino al?l?'?\s*(\d{1,2}\s+[a-zà-ú]{3,})/i.exec(d);
  return { status: "out", until: until ? until[1].toLowerCase() : null };
}

export interface RoleStat {
  avg: number;
  max: number;
  count: number;
}

export interface SyncInfo {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  /** "Ultimo aggiornamento" dichiarato dalla pagina infortuni di Dunkest */
  sourceUpdatedAt: string | null;
  report: LinkReport | null;
}

/** "never" = mai aggiornato, "failed" = l'ultimo tentativo è fallito (si vedono gli ultimi dati validi). */
export function syncState(s: SyncInfo | null): "never" | "ok" | "failed" {
  if (!s || !s.lastSuccessAt) return s?.lastError ? "failed" : "never";
  if (s.lastError && s.lastAttemptAt && s.lastAttemptAt > s.lastSuccessAt) return "failed";
  return "ok";
}

export interface DunkestView {
  /** false se le tabelle non si leggono (migrazione non applicata, errore): le pagine mostrano "dati non disponibili" */
  available: boolean;
  sync: SyncInfo | null;
  stats: Map<number, PlayerStats>;
  injuries: Map<number, Injury>;
  /** media e massimo del punteggio per ruolo, tra i giocatori del listone con almeno una partita */
  roles: Partial<Record<Position, RoleStat>>;
  all: RoleStat | null;
  /** posizione nel ruolo per punteggio (1 = il migliore) */
  ranks: Map<number, { rank: number; of: number }>;
}

export const EMPTY_DUNKEST: DunkestView = { available: false, sync: null, stats: new Map(), injuries: new Map(), roles: {}, all: null, ranks: new Map() };

export interface StatRow extends PlayerStats {
  player_id: number;
  pos: Position | null;
}
export interface InjuryRow {
  player_id: number;
  injured_on: string | null;
  injury: string;
  description: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const roleStat = (pdks: number[]): RoleStat | null =>
  pdks.length === 0 ? null : { avg: round1(pdks.reduce((a, b) => a + b, 0) / pdks.length), max: Math.max(...pdks), count: pdks.length };

export function buildDunkest(sync: SyncInfo | null, statRows: StatRow[], injuryRows: InjuryRow[]): DunkestView {
  const stats = new Map<number, PlayerStats>();
  for (const r of statRows) {
    stats.set(r.player_id, { gp: Number(r.gp), pdk: Number(r.pdk), min: Number(r.min), pts: Number(r.pts), reb: Number(r.reb), ast: Number(r.ast) });
  }
  const played = statRows.filter((r) => Number(r.gp) > 0);
  const roles: DunkestView["roles"] = {};
  const ranks = new Map<number, { rank: number; of: number }>();
  for (const pos of ["G", "A", "C"] as const) {
    const group = played.filter((r) => r.pos === pos).sort((a, b) => Number(b.pdk) - Number(a.pdk));
    const s = roleStat(group.map((r) => Number(r.pdk)));
    if (s) roles[pos] = s;
    // A pari punteggio, stessa posizione.
    group.forEach((r, i) => {
      const prev = i > 0 ? group[i - 1] : null;
      const rank = prev && Number(prev.pdk) === Number(r.pdk) ? ranks.get(prev.player_id)!.rank : i + 1;
      ranks.set(r.player_id, { rank, of: group.length });
    });
  }
  const injuries = new Map<number, Injury>();
  for (const r of injuryRows) {
    const { status, until } = injuryStatus(r.description);
    injuries.set(r.player_id, { status, until, injury: r.injury, description: r.description, since: r.injured_on });
  }
  return { available: true, sync, stats, injuries, roles, all: roleStat(played.map((r) => Number(r.pdk))), ranks };
}

/** Ordine di gravità per i riepiloghi: stagione finita, fuori, in dubbio. */
export const INJURY_ORDER: Record<InjuryStatus, number> = { season: 0, out: 1, doubtful: 2 };
