// Lega privata su Dunkest (issue #72): classifica, calendario e formazioni dall'API dell'app della lega (Fantaking), payload
// per `dunkest_league_apply`, vista per le pagine e confronto tra formazioni schierate e rose dell'app. Tutto puro e testato;
// le richieste di rete stanno in dunkest-league-sync.ts, che gira solo nel job giornaliero.
import { rosterLimitErrors, teamFinance, type CutEntry, type LeagueSettings, type Position, type TeamFinance } from "./cap";
import { linkPlayers, SourceFormatError, type DbPlayer, type LinkReport } from "./dunkest";
import { fmt, fmtEuro } from "./format";

// ---------- Fonte (API interna di fantasy.dunkest.com, non documentata: verificata il 2026-10-27) ----------
// Tutte le route chiedono il token personale di un membro della lega (Bearer). Solo letture.

const API = "https://fantaking-api.dunkest.com/api/v1";
export const leagueUrls = {
  /** torneo: `starting_matchday_id` = id Dunkest della prima giornata */
  tournament: (tournamentId: number) => `${API}/tournaments/${tournamentId}`,
  standings: (tournamentId: number) => `${API}/tournaments/${tournamentId}/standings`,
  /** scontri di una giornata: `{data: []}` prima dell'inizio del torneo, 404 dopo l'ultima giornata */
  matchday: (tournamentId: number, matchdayId: number) => `${API}/tournaments/${tournamentId}/matchdays/${matchdayId}/fantasy-matches`,
  /** uno scontro con le due formazioni (`players: null` finché la giornata non è iniziata) */
  match: (matchId: number) => `${API}/fantasy-matches/${matchId}`,
  /** rosa completa di una squadra della lega (quintetto, panchina e tribuna), anche delle altre */
  teamRoster: (leagueId: number, dunkestTeamId: number) => `${API}/fantasy-leagues/${leagueId}/fantasy-teams/${dunkestTeamId}`,
};

export interface SourceRosterPlayer {
  fantasyId: number;
  firstName: string;
  lastName: string;
  pos: Position | null;
}

export interface SourceStanding {
  dunkestTeamId: number;
  name: string;
  position: number;
  totalPts: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface SourceMatch {
  id: number;
  home: { dunkestTeamId: number; name: string; pts: number | null };
  away: { dunkestTeamId: number; name: string; pts: number | null };
  winnerId: number | null;
}

export interface SourceLineupPlayer {
  fantasyId: number;
  firstName: string;
  lastName: string;
  pos: Position | null;
  role: "starter" | "bench";
  courtPosition: number;
  isCaptain: boolean;
  isSixthMan: boolean;
  pts: number | null;
}

export interface SourceMatchDetail {
  id: number;
  /** null = formazioni non ancora disponibili (giornata da giocare) */
  sides: { dunkestTeamId: number; players: SourceLineupPlayer[] | null }[];
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : typeof v === "number" && Number.isFinite(v) ? v : NaN);
const data = (json: unknown, what: string): unknown => {
  const o = obj(json);
  if (!o || !("data" in o)) throw new SourceFormatError(`${what}: risposta senza "data"`);
  return o.data;
};

export function parseTournament(json: unknown): { startingMatchdayId: number; name: string } {
  const d = obj(data(json, "torneo"));
  const start = int(d?.starting_matchday_id);
  if (!d || start === null) throw new SourceFormatError("torneo: manca starting_matchday_id");
  return { startingMatchdayId: start, name: String(d.name ?? "") };
}

export function parseStandings(json: unknown): SourceStanding[] {
  const rows = data(json, "classifica");
  if (!Array.isArray(rows)) throw new SourceFormatError("classifica: la risposta non è una lista");
  if (rows.length === 0) throw new SourceFormatError("classifica: lista vuota");
  return rows.map((r) => {
    const o = obj(r);
    const s: SourceStanding = {
      dunkestTeamId: int(o?.id) ?? NaN,
      name: String(o?.name ?? "").trim(),
      position: int(o?.position) ?? NaN,
      totalPts: numOrNull(o?.total_pts) ?? 0,
      wins: int(o?.wins) ?? 0,
      draws: int(o?.draws) ?? 0,
      losses: int(o?.losses) ?? 0,
    };
    if (!Number.isInteger(s.dunkestTeamId) || !Number.isInteger(s.position) || s.position < 1 || !Number.isFinite(s.totalPts)) {
      throw new SourceFormatError(`classifica: riga senza id, posizione o punti (${JSON.stringify(r).slice(0, 120)})`);
    }
    return s;
  });
}

function side(v: unknown, what: string) {
  const o = obj(v);
  const id = int(o?.id);
  const pts = numOrNull(o?.pts);
  if (!o || id === null || Number.isNaN(pts)) throw new SourceFormatError(`${what}: squadra senza id o con punti non numerici`);
  return { dunkestTeamId: id, name: String(o.name ?? "").trim(), pts };
}

/** Scontri di una giornata. Lista vuota ammessa (giornata prima dell'inizio del torneo). */
export function parseMatchday(json: unknown): SourceMatch[] {
  const rows = data(json, "giornata");
  if (!Array.isArray(rows)) throw new SourceFormatError("giornata: la risposta non è una lista");
  return rows.map((r) => {
    const o = obj(r);
    const id = int(o?.id);
    if (!o || id === null) throw new SourceFormatError("giornata: scontro senza id");
    return { id, home: side(o.home_team, "giornata"), away: side(o.away_team, "giornata"), winnerId: int(o.winner_id) };
  });
}

const POS: Record<string, Position> = { Guard: "G", Forward: "A", Center: "C" };

function lineupPlayers(list: unknown, role: "starter" | "bench"): SourceLineupPlayer[] {
  if (!Array.isArray(list)) throw new SourceFormatError(`formazione: ${role === "starter" ? "quintetto" : "panchina"} non è una lista`);
  return list.map((p) => {
    const o = obj(p);
    const id = int(o?.id);
    const pts = numOrNull(o?.pts);
    const last = String(o?.last_name ?? "").trim();
    if (!o || id === null || !last || Number.isNaN(pts)) throw new SourceFormatError(`formazione: giocatore senza id o nome (${JSON.stringify(p).slice(0, 100)})`);
    return {
      fantasyId: id,
      firstName: String(o.first_name ?? "").trim(),
      lastName: last,
      pos: POS[String(obj(o.position)?.name ?? "")] ?? null,
      role,
      courtPosition: int(o.court_position) ?? 0,
      isCaptain: o.is_captain === true,
      isSixthMan: o.is_sixth_man === true,
      pts,
    };
  });
}

/** Rosa di una squadra: lista di giocatori (può essere vuota prima dell'asta). */
export function parseTeamRoster(json: unknown): SourceRosterPlayer[] {
  const rows = data(json, "rosa");
  if (!Array.isArray(rows)) throw new SourceFormatError("rosa: la risposta non è una lista");
  return rows.map((p) => {
    const o = obj(p);
    const id = int(o?.id);
    const last = String(o?.last_name ?? "").trim();
    if (!o || id === null || !last) throw new SourceFormatError(`rosa: giocatore senza id o nome (${JSON.stringify(p).slice(0, 100)})`);
    return { fantasyId: id, firstName: String(o.first_name ?? "").trim(), lastName: last, pos: POS[String(obj(o.position)?.name ?? "")] ?? null };
  });
}

export function parseMatchDetail(json: unknown): SourceMatchDetail {
  const d = obj(data(json, "scontro"));
  const id = int(d?.id);
  if (!d || id === null) throw new SourceFormatError("scontro: manca l'id");
  const sides = [d.home_team, d.away_team].map((t) => {
    const o = obj(t);
    const teamId = int(o?.id);
    if (!o || teamId === null) throw new SourceFormatError("scontro: squadra senza id");
    const players = obj(o.players);
    if (o.players === null || o.players === undefined) return { dunkestTeamId: teamId, players: null };
    if (!players) throw new SourceFormatError("scontro: formazione in un formato inatteso");
    return { dunkestTeamId: teamId, players: [...lineupPlayers(players.starters, "starter"), ...lineupPlayers(players.bench, "bench")] };
  });
  return { id, sides };
}

// ---------- Quali giornate leggere ----------

export interface KnownMatchday {
  dunkestMatchdayId: number;
  matchday: number;
  /** almeno uno scontro ha punti */
  scored: boolean;
}

/** Il calendario completo si rilegge al primo giro e poi una volta a settimana (gli accoppiamenti dei playoff arrivano dopo). */
export const CALENDAR_MAX_AGE_DAYS = 7;
/** Tetto alle giornate lette in un calendario completo: oltre, la fonte è cambiata. Il 2026-27 ne ha 100. */
export const MAX_MATCHDAYS = 200;

/**
 * Giornate da rileggere oggi: tutte se il calendario manca o è vecchio, altrimenti l'ultima con punti, quella prima (per
 * chiuderne il risultato il giorno dopo) e quella dopo (può essere appena iniziata). Senza giornate giocate: le prime due.
 */
export function matchdaysToRead(known: KnownMatchday[], calendarAt: string | null, now: Date): { full: boolean; matchdays: KnownMatchday[] } {
  const sorted = [...known].sort((a, b) => a.matchday - b.matchday);
  const stale = !calendarAt || now.getTime() - new Date(calendarAt).getTime() > CALENDAR_MAX_AGE_DAYS * 86_400_000;
  if (sorted.length === 0 || stale) return { full: true, matchdays: [] };
  return { full: false, matchdays: windowAround(sorted) };
}

/** Ultima giornata con punti ±1 (giornate ordinate). */
export function windowAround<T extends { scored: boolean }>(sorted: T[]): T[] {
  let last = -1;
  sorted.forEach((m, i) => {
    if (m.scored) last = i;
  });
  if (last < 0) return sorted.slice(0, 2);
  return sorted.slice(Math.max(0, last - 1), last + 2);
}

// ---------- Payload per `dunkest_league_apply` ----------

export interface LeagueTeamLink {
  teamId: string;
  dunkestTeamId: number;
  name: string;
}

export interface FetchedMatchday {
  dunkestMatchdayId: number;
  matchday: number;
  matches: SourceMatch[];
}

/** Report della parte di lega (in `dunkest_sync.league_report` e nello storico). */
export interface LeagueReport {
  /** giocatori schierati su Dunkest senza un giocatore della lega con lo stesso nome */
  unlinked: string[];
  ambiguous: LinkReport["ambiguous"];
  /** calendario riletto per intero in questa esecuzione */
  full: boolean;
  /** giornate lette */
  matchdays: number[];
  /** conteggi scritti dalla RPC (solo nello storico) */
  standings?: number;
  matches?: number;
  lineups?: number;
  rosters?: number | null;
  links?: number;
}

export interface LeaguePayload {
  season_id: number;
  full_calendar: boolean;
  standings: { team_id: string; position: number; total_pts: number; wins: number; draws: number; losses: number }[];
  matches: { id: number; matchday: number; dunkest_matchday_id: number; home_team_id: string; away_team_id: string; home_pts: number | null; away_pts: number | null; winner_team_id: string | null }[];
  lineup_matches: number[];
  lineups: {
    match_id: number;
    team_id: string;
    fantasy_player_id: number;
    player_id: number | null;
    name: string;
    pos: Position | null;
    role: "starter" | "bench";
    court_position: number;
    is_captain: boolean;
    is_sixth_man: boolean;
    pts: number | null;
  }[];
  /** se presente, sostituisce per intero le rose Dunkest della stagione (migrazione 20261027120328) */
  rosters?: { team_id: string; fantasy_player_id: number; player_id: number | null; name: string; pos: Position | null }[];
  links: { player_id: number; fantasy_id: number }[];
  report: LeagueReport;
}

/** Giocatore della lega con l'id Fantaking già trovato (null se mai collegato). */
export interface LeagueDbPlayer extends Omit<DbPlayer, "dunkestId" | "rostered"> {
  fantasyId: number | null;
}

/**
 * Dalle risposte già lette ai dati da scrivere. Una squadra Dunkest senza collegamento in `dunkest_teams` ferma tutto: non si
 * indovina dal nome. I giocatori si collegano come per le statistiche (`linkPlayers`: id già salvato, poi nome intero, poi senza
 * suffisso); chi resta fuori si scrive col solo nome e finisce nel report.
 */
export function buildLeaguePayload(input: {
  seasonId: number;
  teams: LeagueTeamLink[];
  players: LeagueDbPlayer[];
  standings: SourceStanding[];
  matchdays: FetchedMatchday[];
  details: SourceMatchDetail[];
  full: boolean;
  /** rose complete per squadra (assenti se la stagione non ha l'id della lega) */
  rosters?: { dunkestTeamId: number; players: SourceRosterPlayer[] }[];
}): LeaguePayload {
  const teamOf = new Map(input.teams.map((t) => [t.dunkestTeamId, t.teamId]));
  const team = (id: number, name: string) => {
    const t = teamOf.get(id);
    if (!t) throw new Error(`squadra Dunkest «${name || id}» (id ${id}) non collegata a una squadra della lega: va aggiunta in dunkest_teams`);
    return t;
  };

  const standings = input.standings.map((s) => ({ team_id: team(s.dunkestTeamId, s.name), position: s.position, total_pts: s.totalPts, wins: s.wins, draws: s.draws, losses: s.losses }));
  const names = new Map<number, string>();
  const matches: LeaguePayload["matches"] = [];
  for (const md of input.matchdays) {
    for (const m of md.matches) {
      names.set(m.home.dunkestTeamId, m.home.name);
      names.set(m.away.dunkestTeamId, m.away.name);
      matches.push({
        id: m.id,
        matchday: md.matchday,
        dunkest_matchday_id: md.dunkestMatchdayId,
        home_team_id: team(m.home.dunkestTeamId, m.home.name),
        away_team_id: team(m.away.dunkestTeamId, m.away.name),
        home_pts: m.home.pts,
        away_pts: m.away.pts,
        winner_team_id: m.winnerId === null ? null : team(m.winnerId, names.get(m.winnerId) ?? ""),
      });
    }
  }

  const lineupPlayers = input.details.flatMap((d) => d.sides.flatMap((s) => s.players ?? []));
  const rosterPlayers = (input.rosters ?? []).flatMap((r) => r.players);
  const label = (p: { firstName: string; lastName: string }) => (p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName);
  const { links, newLinks, ambiguous, unlinked } = linkPlayers(
    input.players.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, nbaTeam: p.nbaTeam, dunkestId: p.fantasyId, rostered: false })),
    [...rosterPlayers, ...lineupPlayers].map((p) => ({ dunkestId: p.fantasyId, name: label(p), team: null, label: label(p) })),
  );
  const rosters: LeaguePayload["rosters"] = input.rosters?.flatMap((r) => {
    const teamId = team(r.dunkestTeamId, names.get(r.dunkestTeamId) ?? "");
    const seen = new Set<number>();
    return r.players.flatMap((p) => {
      if (seen.has(p.fantasyId)) return [];
      seen.add(p.fantasyId);
      return [{ team_id: teamId, fantasy_player_id: p.fantasyId, player_id: links.get(p.fantasyId) ?? null, name: label(p), pos: p.pos }];
    });
  });

  const lineups: LeaguePayload["lineups"] = [];
  const lineupMatches: number[] = [];
  for (const d of input.details) {
    if (d.sides.every((s) => s.players === null)) continue;
    lineupMatches.push(d.id);
    for (const s of d.sides) {
      const seen = new Set<number>();
      for (const p of s.players ?? []) {
        if (seen.has(p.fantasyId)) continue;
        seen.add(p.fantasyId);
        lineups.push({
          match_id: d.id,
          team_id: team(s.dunkestTeamId, names.get(s.dunkestTeamId) ?? ""),
          fantasy_player_id: p.fantasyId,
          player_id: links.get(p.fantasyId) ?? null,
          name: label(p),
          pos: p.pos,
          role: p.role,
          court_position: p.courtPosition,
          is_captain: p.isCaptain,
          is_sixth_man: p.isSixthMan,
          pts: p.pts,
        });
      }
    }
  }

  const byName = (a: string, b: string) => a.localeCompare(b, "it");
  return {
    season_id: input.seasonId,
    full_calendar: input.full,
    standings,
    matches,
    lineup_matches: lineupMatches,
    lineups,
    ...(rosters ? { rosters } : {}),
    links: newLinks.map((l) => ({ player_id: l.playerId, fantasy_id: l.dunkestId })),
    report: {
      unlinked: [...new Set(unlinked.map((s) => s.label))].sort(byName),
      ambiguous,
      full: input.full,
      matchdays: input.matchdays.map((m) => m.matchday).sort((a, b) => a - b),
    },
  };
}

// ---------- Vista per le pagine ----------

export interface Standing {
  teamId: string;
  position: number;
  totalPts: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface LeagueMatch {
  id: number;
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  homePts: number | null;
  awayPts: number | null;
  winnerTeamId: string | null;
}

export interface LineupPlayer {
  fantasyId: number;
  playerId: number | null;
  name: string;
  pos: Position | null;
  role: "starter" | "bench";
  courtPosition: number;
  isCaptain: boolean;
  isSixthMan: boolean;
  pts: number | null;
}

/** "token_missing" = DUNKEST_TOKEN non impostato, "token_rejected" = Dunkest risponde 401 (token da rinnovare). */
export type LeagueErrorCode = "token_missing" | "token_rejected" | "error";

export interface LeagueSyncInfo {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  errorCode: LeagueErrorCode | null;
  report: LeagueReport | null;
  calendarAt: string | null;
  tokenOkSince: string | null;
  tokenOkAt: string | null;
  tokenRejectedAt: string | null;
}

export type MatchdayState = "played" | "latest" | "upcoming";

export interface MatchdayView {
  matchday: number;
  state: MatchdayState;
  matches: LeagueMatch[];
}

export interface DunkestLeagueView {
  /** false se le tabelle non si leggono (migrazione non applicata, errore) */
  available: boolean;
  sync: LeagueSyncInfo | null;
  standings: Standing[];
  matchdays: MatchdayView[];
  /** ultima giornata con punti (null se il torneo non è iniziato o il calendario non c'è) */
  latest: number | null;
}

export const EMPTY_LEAGUE: DunkestLeagueView = { available: false, sync: null, standings: [], matchdays: [], latest: null };

/**
 * Le giornate prima dell'ultima con punti sono giocate; l'ultima è "latest" (può essere ancora in corso: Dunkest non dice
 * quando una giornata è chiusa, quindi la pagina non la dichiara finita); le altre sono da giocare.
 */
export function buildLeagueView(sync: LeagueSyncInfo | null, standings: Standing[], matches: LeagueMatch[]): DunkestLeagueView {
  const byDay = new Map<number, LeagueMatch[]>();
  for (const m of matches) byDay.set(m.matchday, [...(byDay.get(m.matchday) ?? []), m]);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const scored = days.filter((d) => byDay.get(d)!.some((m) => m.homePts !== null || m.awayPts !== null));
  const latest = scored.length ? scored[scored.length - 1] : null;
  return {
    available: true,
    sync,
    standings: [...standings].sort((a, b) => a.position - b.position),
    matchdays: days.map((d) => ({
      matchday: d,
      state: latest === null || d > latest ? "upcoming" : d === latest ? "latest" : "played",
      matches: byDay.get(d)!.sort((a, b) => a.id - b.id),
    })),
    latest,
  };
}

/** "ok" = il token ha funzionato all'ultimo giro; "rejected" = Dunkest lo rifiuta; "missing" = variabile non impostata. */
export function tokenState(s: LeagueSyncInfo | null): "ok" | "rejected" | "missing" | "unknown" {
  if (!s) return "unknown";
  if (s.errorCode === "token_rejected") return "rejected";
  if (s.errorCode === "token_missing") return "missing";
  return s.tokenOkAt ? "ok" : "unknown";
}

/** Giorni interi da quando il token funziona senza interruzioni (null se non funziona o non si sa). */
export function tokenDays(s: LeagueSyncInfo | null, now: Date): number | null {
  if (!s?.tokenOkSince || tokenState(s) !== "ok") return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(s.tokenOkSince).getTime()) / 86_400_000));
}

/** Prossimo scontro (o quello dell'ultima giornata) di una squadra. */
export function teamMatch(view: DunkestLeagueView, teamId: string, which: "latest" | "next"): { matchday: number; match: LeagueMatch } | null {
  const days = which === "latest" ? view.matchdays.filter((d) => d.state === "latest") : view.matchdays.filter((d) => d.state === "upcoming");
  for (const d of days) {
    const match = d.matches.find((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    if (match) return { matchday: d.matchday, match };
  }
  return null;
}

/** Ultimi risultati di una squadra (dal più vecchio): V, P o N, solo giornate giocate (non l'ultima, che può essere in corso). */
export function teamForm(view: DunkestLeagueView, teamId: string, n = 5): ("W" | "L" | "D")[] {
  const out: ("W" | "L" | "D")[] = [];
  for (const d of view.matchdays) {
    if (d.state !== "played") continue;
    const m = d.matches.find((x) => x.homeTeamId === teamId || x.awayTeamId === teamId);
    if (!m || m.homePts === null || m.awayPts === null) continue;
    out.push(m.winnerTeamId === null ? "D" : m.winnerTeamId === teamId ? "W" : "L");
  }
  return out.slice(-n);
}

// ---------- Confronto formazione Dunkest ↔ rose dell'app ----------

/** Dove sta un giocatore nelle rose dell'app (stagione corrente). */
export interface RosterRef {
  teamId: string;
  slot: "starter" | "reserve";
}

/**
 * Stato di un giocatore schierato su Dunkest rispetto all'app:
 * ok = titolare della stessa squadra; reserve = riserva della stessa squadra (le riserve non sono schierabili, R-03);
 * other_team = a contratto con un'altra squadra; free = in nessuna rosa; unlinked = non collegato a un giocatore della lega.
 */
export type LineupStatus = "ok" | "reserve" | "other_team" | "free" | "unlinked";

export interface CheckedPlayer extends LineupPlayer {
  status: LineupStatus;
  /** squadra dell'app per `other_team` */
  otherTeamId: string | null;
}

export interface LineupCheck {
  starters: CheckedPlayer[];
  bench: CheckedPlayer[];
  /** titolari dell'app non schierati: in tribuna su Dunkest (o assenti dalla rosa Dunkest) */
  stands: number[];
  /** giocatori schierati con stato diverso da ok */
  issues: CheckedPlayer[];
}

/**
 * Confronta la formazione di una squadra in uno scontro con le rose dell'app di adesso. È un avviso, non un errore: le rose
 * su Dunkest le aggiornano a mano i proprietari e possono essere indietro di qualche ora (ASSUNZIONE in OPEN-QUESTIONS).
 * `starterIds`: titolari della squadra nell'app; `rosters`: giocatore → squadra e slot per tutte le squadre.
 */
export function checkLineup(teamId: string, lineup: LineupPlayer[], starterIds: number[], rosters: Map<number, RosterRef>): LineupCheck {
  const checked = [...lineup]
    .sort((a, b) => a.courtPosition - b.courtPosition)
    .map((p): CheckedPlayer => {
      if (p.playerId === null) return { ...p, status: "unlinked", otherTeamId: null };
      const r = rosters.get(p.playerId);
      if (!r) return { ...p, status: "free", otherTeamId: null };
      if (r.teamId !== teamId) return { ...p, status: "other_team", otherTeamId: r.teamId };
      return { ...p, status: r.slot === "starter" ? "ok" : "reserve", otherTeamId: null };
    });
  const fielded = new Set(lineup.map((p) => p.playerId).filter((x): x is number => x !== null));
  return {
    starters: checked.filter((p) => p.role === "starter"),
    bench: checked.filter((p) => p.role === "bench"),
    stands: starterIds.filter((id) => !fielded.has(id)),
    issues: checked.filter((p) => p.status !== "ok"),
  };
}

/** Indice giocatore → squadra e slot dalle rose dell'app (titolari e riserve, stagione corrente). */
export function rosterRefs(teams: { team: { id: string }; starters: { playerId: number }[]; reserves: { playerId: number }[] }[]): Map<number, RosterRef> {
  const out = new Map<number, RosterRef>();
  for (const t of teams) {
    for (const p of t.starters) out.set(p.playerId, { teamId: t.team.id, slot: "starter" });
    for (const p of t.reserves) out.set(p.playerId, { teamId: t.team.id, slot: "reserve" });
  }
  return out;
}

// ---------- Allineamento titolari ↔ riserve alla rosa Dunkest ----------
// Decisione dell'utente (2026-10-27): chi è nella rosa Dunkest di una squadra (quintetto, panchina o tribuna) è un titolare
// nell'app. L'app propone lo scambio e un admin lo conferma; se il cap sfora avvisa e allinea lo stesso.

/** Giocatore della rosa Dunkest salvata (`dunkest_rosters`). */
export interface DunkestRosterPlayer {
  fantasyId: number;
  playerId: number | null;
  name: string;
  pos: Position | null;
}

/** Contratto della squadra nell'app, quanto basta per spostarlo e calcolarne l'effetto. */
export interface AlignContract {
  contractId: number;
  playerId: number;
  name: string;
  pos: Position | null;
  slot: "starter" | "reserve";
  salary: number;
}

export interface Alignment {
  /** riserve dell'app che su Dunkest sono in rosa: diventano titolari */
  promote: AlignContract[];
  /** titolari dell'app che su Dunkest non ci sono: diventano riserve */
  demote: AlignContract[];
  /** motivi per cui non si può allineare in automatico (giocatori non collegati, di altre squadre, numeri che non tornano) */
  blockers: string[];
  /** cap e budget riserve dopo l'allineamento: avvisi, non blocchi (decisione dell'utente) */
  warnings: string[];
  before: TeamFinance;
  after: TeamFinance;
}

/**
 * Cosa cambia per far coincidere i titolari dell'app con la rosa Dunkest di una squadra. Blocca (e lascia fare all'admin a mano)
 * se un giocatore Dunkest non è collegato o è di un'altra squadra nell'app, se la rosa Dunkest non ha tanti giocatori quanti i
 * titolari previsti, se entrano e escono numeri diversi o se si superano i massimi per ruolo (R-01..R-03, come le altre
 * operazioni admin). Cap e riserve sforati sono solo avvisi.
 */
export function rosterAlignment(
  teamId: string,
  team: { contracts: AlignContract[]; cuts: CutEntry[]; bonus: number },
  dunkest: DunkestRosterPlayer[],
  rosters: Map<number, RosterRef>,
  teamName: (id: string) => string,
  s: LeagueSettings,
): Alignment {
  const blockers: string[] = [];
  const startersTotal = s.starters.G + s.starters.A + s.starters.C;
  if (dunkest.length !== startersTotal) blockers.push(`La rosa su Dunkest ha ${dunkest.length} giocatori invece di ${startersTotal}.`);
  const inDunkest = new Set<number>();
  for (const p of dunkest) {
    if (p.playerId === null) {
      blockers.push(`${p.name} non è collegato a un giocatore della lega.`);
      continue;
    }
    inDunkest.add(p.playerId);
    const r = rosters.get(p.playerId);
    if (!r) blockers.push(`${p.name} è nella rosa Dunkest ma nell'app non è in nessuna squadra.`);
    else if (r.teamId !== teamId) blockers.push(`${p.name} è nella rosa Dunkest ma nell'app è di ${teamName(r.teamId)}.`);
  }
  const promote = team.contracts.filter((c) => c.slot === "reserve" && inDunkest.has(c.playerId));
  const demote = team.contracts.filter((c) => c.slot === "starter" && !inDunkest.has(c.playerId));
  if (blockers.length === 0 && promote.length !== demote.length) {
    blockers.push(`Entrerebbero ${promote.length} titolari e ne uscirebbero ${demote.length}: i conti non tornano.`);
  }

  const moved = new Set([...promote, ...demote].map((c) => c.contractId));
  const entry = (c: AlignContract, slot: AlignContract["slot"]) => ({ position: c.pos, slot, salary: c.salary });
  const before = team.contracts.map((c) => entry(c, c.slot));
  const after = team.contracts.map((c) => entry(c, moved.has(c.contractId) ? (c.slot === "starter" ? "reserve" : "starter") : c.slot));
  if (moved.size > 0) blockers.push(...rosterLimitErrors(before, after, s));

  const fBefore = teamFinance(before, team.cuts, team.bonus, s);
  const fAfter = teamFinance(after, team.cuts, team.bonus, s);
  const warnings: string[] = [];
  if (moved.size > 0 && fAfter.overCap) {
    warnings.push(`Dopo l'allineamento il monte ingaggi (${fmt(fAfter.payroll)}) supera il cap di ${fmt(fAfter.effectiveCap)} (R-10): luxury tax ${fmtEuro(fAfter.luxuryTaxEur)} €.`);
  }
  if (moved.size > 0 && fAfter.reserveSpace < 0) warnings.push(`Dopo l'allineamento le riserve superano il budget di ${fmt(-fAfter.reserveSpace)} (R-03).`);
  return { promote, demote, blockers, warnings, before: fBefore, after: fAfter };
}

/**
 * Tribuna di una squadra in uno scontro: dalla rosa Dunkest (in rosa e non schierati) se c'è, altrimenti i titolari dell'app
 * non schierati (`check.stands`).
 */
export function tribune(
  lineup: LineupPlayer[],
  dunkestRoster: DunkestRosterPlayer[] | undefined,
  appStarters: { playerId: number; name: string; pos: Position | null }[],
  check: LineupCheck,
): { fromDunkest: boolean; players: { id: number; name: string; pos: Position | null }[] } {
  if (dunkestRoster && dunkestRoster.length > 0) {
    const fielded = new Set(lineup.map((p) => p.fantasyId));
    return { fromDunkest: true, players: dunkestRoster.filter((p) => !fielded.has(p.fantasyId)).map((p) => ({ id: p.fantasyId, name: p.name, pos: p.pos })) };
  }
  const byId = new Map(appStarters.map((p) => [p.playerId, p]));
  return { fromDunkest: false, players: check.stands.flatMap((id) => (byId.has(id) ? [{ id, name: byId.get(id)!.name, pos: byId.get(id)!.pos }] : [])) };
}
