import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Position } from "./cap";
import { SourceFormatError } from "./dunkest";
import {
  buildLeaguePayload,
  buildLeagueView,
  checkLineup,
  matchdaysToRead,
  parseMatchday,
  parseMatchDetail,
  parseStandings,
  parseTeamRoster,
  rosterAlignment,
  parseTournament,
  teamForm,
  teamMatch,
  tokenDays,
  tokenState,
  tribune,
  windowAround,
  type LeagueDbPlayer,
  type LeagueMatch,
  type LeagueSyncInfo,
  type LeagueTeamLink,
  type AlignContract,
  type DunkestRosterPlayer,
  type LineupPlayer,
  type RosterRef,
} from "./dunkest-league";

// Risposte vere dell'API della lega (2026-10-27, giornata 3 in corso), senza utenti né codici d'invito.
const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "dunkest-league.json"), "utf8"));

const TEAMS: LeagueTeamLink[] = [
  ["spa", 3233625, "Spaccinos"],
  ["anv", 3233650, "Atlanto Non Vinco"],
  ["asf", 3233688, "Assago Farmers"],
  ["sas", 3233754, "San Antonio"],
  ["dam", 3233925, "Dame Time"],
  ["cus", 3234157, "CUS Cosenza"],
  ["bol", 3234455, "Bol Bollerz"],
  ["okc", 3234648, "OKCC"],
].map(([teamId, dunkestTeamId, name]) => ({ teamId: teamId as string, dunkestTeamId: dunkestTeamId as number, name: name as string }));

const p = (id: number, firstName: string, lastName: string, fantasyId: number | null = null): LeagueDbPlayer => ({ id, firstName, lastName, nbaTeam: null, fantasyId });

describe("parser dell'API della lega", () => {
  it("torneo: giornata d'inizio", () => {
    expect(parseTournament(fx.tournament)).toEqual({ startingMatchdayId: 1858, name: "KD FOTO PIEDI" });
    expect(() => parseTournament({ data: {} })).toThrow(SourceFormatError);
  });

  it("classifica: 8 squadre con posizione, punti totali e record", () => {
    const s = parseStandings(fx.standings);
    expect(s).toHaveLength(8);
    expect(s[0]).toEqual({ dunkestTeamId: 3233650, name: "Atlanto Non Vinco", position: 1, totalPts: 700.36, wins: 3, draws: 0, losses: 0 });
    expect(s.find((x) => x.name === "Bol Bollerz")).toMatchObject({ position: 4, totalPts: 721.71, wins: 2, losses: 1 });
  });

  it("classifica vuota o senza data: errore di formato (il job tiene quella di ieri)", () => {
    expect(() => parseStandings({ data: [] })).toThrow(SourceFormatError);
    expect(() => parseStandings({ code: "NOT_FOUND" })).toThrow(SourceFormatError);
    expect(() => parseStandings({ data: [{ id: 1, name: "x" }] })).toThrow(/posizione/);
  });

  it("giornata: scontri con punti e vincitore; giornata futura con punti null", () => {
    const md = parseMatchday(fx.matchday);
    expect(md).toHaveLength(4);
    expect(md[1]).toEqual({
      id: 8426831,
      home: { dunkestTeamId: 3233688, name: "Assago Farmers", pts: 243.44 },
      away: { dunkestTeamId: 3234455, name: "Bol Bollerz", pts: 292.9 },
      winnerId: 3234455,
    });
    const future = parseMatchday(fx.matchdayFuture);
    expect(future.every((m) => m.home.pts === null && m.away.pts === null && m.winnerId === null)).toBe(true);
    expect(parseMatchday({ data: [] })).toEqual([]);
  });

  it("scontro: quintetto e panchina con ruolo, capitano e sesto uomo", () => {
    const d = parseMatchDetail(fx.match);
    expect(d.id).toBe(8426831);
    const home = d.sides[0].players!;
    expect(home).toHaveLength(10);
    expect(home.filter((x) => x.role === "starter")).toHaveLength(5);
    expect(home[0]).toEqual({ fantasyId: 140, firstName: "Alperen", lastName: "Sengun", pos: "C", role: "starter", courtPosition: 1, isCaptain: true, isSixthMan: false, pts: 51.19 });
    expect(home.find((x) => x.isSixthMan)).toMatchObject({ lastName: "Young", role: "bench", pos: "G" });
    // Pts null: non ha ancora giocato nella giornata.
    expect(d.sides[1].players!.find((x) => x.lastName === "Camara")?.pts).toBeNull();
  });

  it("scontro da giocare: formazioni null", () => {
    expect(parseMatchDetail(fx.matchFuture).sides.map((s) => s.players)).toEqual([null, null]);
    expect(() => parseMatchDetail({ data: { id: 1, home_team: { id: 2, players: { starters: "x" } }, away_team: { id: 3, players: null } } })).toThrow(SourceFormatError);
  });
});

describe("giornate da leggere", () => {
  const known = (n: number, scoredUpTo: number) => Array.from({ length: n }, (_, i) => ({ dunkestMatchdayId: 1858 + i, matchday: i + 1, scored: i + 1 <= scoredUpTo }));
  const now = new Date("2026-10-27T08:00:00Z");

  it("primo giro o calendario vecchio di più di una settimana: calendario completo", () => {
    expect(matchdaysToRead([], null, now).full).toBe(true);
    expect(matchdaysToRead(known(100, 3), "2026-10-19T08:00:00Z", now).full).toBe(true);
  });

  it("altrimenti l'ultima giornata con punti, quella prima e quella dopo", () => {
    const r = matchdaysToRead(known(100, 3), "2026-10-26T08:00:00Z", now);
    expect(r.full).toBe(false);
    expect(r.matchdays.map((m) => m.matchday)).toEqual([2, 3, 4]);
    expect(windowAround(known(5, 0)).map((m) => m.matchday)).toEqual([1, 2]);
    expect(windowAround(known(5, 1)).map((m) => m.matchday)).toEqual([1, 2]);
    expect(windowAround(known(5, 5)).map((m) => m.matchday)).toEqual([4, 5]);
  });
});

describe("buildLeaguePayload", () => {
  const detail = parseMatchDetail(fx.match);
  const base = {
    seasonId: 1,
    teams: TEAMS,
    players: [p(10, "Luka", "Doncic", 3), p(11, "Nikola", "Jokic"), p(12, "Alperen", "Sengun"), p(13, "Michael", "Porter Jr."), p(14, "", "Holmgren")],
    standings: parseStandings(fx.standings),
    matchdays: [{ dunkestMatchdayId: 1860, matchday: 3, matches: parseMatchday(fx.matchday) }],
    details: [detail, parseMatchDetail(fx.matchFuture)],
    full: false,
  };
  const payload = buildLeaguePayload(base);

  it("squadre Dunkest tradotte nelle squadre della lega", () => {
    expect(payload.standings[0]).toEqual({ team_id: "anv", position: 1, total_pts: 700.36, wins: 3, draws: 0, losses: 0 });
    expect(payload.matches.find((m) => m.id === 8426831)).toEqual({
      id: 8426831, matchday: 3, dunkest_matchday_id: 1860, home_team_id: "asf", away_team_id: "bol", home_pts: 243.44, away_pts: 292.9, winner_team_id: "bol",
    });
  });

  it("una squadra Dunkest non collegata ferma tutto", () => {
    expect(() => buildLeaguePayload({ ...base, teams: TEAMS.filter((t) => t.name !== "OKCC") })).toThrow(/OKCC.*dunkest_teams/);
  });

  it("formazioni: solo gli scontri iniziati, con giocatori collegati per id o per nome", () => {
    expect(payload.lineup_matches).toEqual([8426831]);
    expect(payload.lineups).toHaveLength(20);
    const doncic = payload.lineups.find((l) => l.fantasy_player_id === 3)!;
    expect(doncic).toMatchObject({ team_id: "bol", player_id: 10, role: "starter", name: "Luka Doncic" });
    // Nome intero; Porter Jr (senza punto) col nome senza suffisso.
    expect(payload.lineups.find((l) => l.name === "Nikola Jokic")).toMatchObject({ player_id: 11, role: "bench", is_sixth_man: true });
    expect(payload.lineups.find((l) => l.name === "Michael Porter Jr")?.player_id).toBe(13);
    // Il provvisorio (solo cognome) non si collega mai.
    expect(payload.lineups.find((l) => l.name === "Chet Holmgren")?.player_id).toBeNull();
    expect(payload.links).toEqual(
      expect.arrayContaining([
        { player_id: 11, fantasy_id: 1 },
        { player_id: 12, fantasy_id: 140 },
      ]),
    );
    expect(payload.links.some((l) => l.player_id === 10)).toBe(false); // già collegato
    expect(payload.report.unlinked).toContain("Chet Holmgren");
    expect(payload.report).toMatchObject({ full: false, matchdays: [3] });
  });
});

describe("vista e confronto", () => {
  const m = (id: number, matchday: number, home: string, away: string, homePts: number | null, awayPts: number | null, winner: string | null = null): LeagueMatch => ({
    id, matchday, homeTeamId: home, awayTeamId: away, homePts, awayPts, winnerTeamId: winner,
  });
  const view = buildLeagueView(null, [{ teamId: "b", position: 2, totalPts: 600, wins: 1, draws: 0, losses: 1 }, { teamId: "a", position: 1, totalPts: 700, wins: 2, draws: 0, losses: 0 }], [
    m(1, 1, "a", "b", 240, 233, "a"),
    m(2, 2, "b", "a", 200, 250, "a"),
    m(3, 3, "a", "b", 120, 130, "b"),
    m(4, 4, "b", "a", null, null),
  ]);

  it("giornate: giocate, ultima con punti, da giocare; classifica ordinata", () => {
    expect(view.matchdays.map((d) => d.state)).toEqual(["played", "played", "latest", "upcoming"]);
    expect(view.latest).toBe(3);
    expect(view.standings.map((s) => s.teamId)).toEqual(["a", "b"]);
    expect(teamMatch(view, "b", "latest")?.match.id).toBe(3);
    expect(teamMatch(view, "b", "next")?.match.id).toBe(4);
    // L'ultima giornata può essere in corso: non entra nella forma.
    expect(teamForm(view, "a")).toEqual(["W", "W"]);
    expect(teamForm(view, "b")).toEqual(["L", "L"]);
  });

  it("stato del token", () => {
    const s = (extra: Partial<LeagueSyncInfo>): LeagueSyncInfo => ({
      lastSuccessAt: null, lastAttemptAt: null, lastError: null, errorCode: null, report: null, calendarAt: null, tokenOkSince: null, tokenOkAt: null, tokenRejectedAt: null, ...extra,
    });
    const now = new Date("2026-11-06T09:00:00Z");
    expect(tokenState(null)).toBe("unknown");
    expect(tokenState(s({ errorCode: "token_rejected" }))).toBe("rejected");
    expect(tokenState(s({ errorCode: "token_missing" }))).toBe("missing");
    expect(tokenState(s({ tokenOkAt: "2026-11-06T08:00:00Z", tokenOkSince: "2026-10-27T08:00:00Z" }))).toBe("ok");
    expect(tokenDays(s({ tokenOkAt: "2026-11-06T08:00:00Z", tokenOkSince: "2026-10-27T08:00:00Z" }), now)).toBe(10);
    // Un errore che non è del token non azzera i giorni.
    expect(tokenDays(s({ errorCode: "error", tokenOkAt: "2026-11-05T08:00:00Z", tokenOkSince: "2026-10-27T08:00:00Z" }), now)).toBe(10);
    expect(tokenDays(s({ errorCode: "token_rejected", tokenOkSince: null }), now)).toBeNull();
  });

  it("checkLineup: titolari ok, riserva schierata, giocatore di un'altra squadra, svincolato, non collegato, tribuna", () => {
    const lp = (playerId: number | null, name: string, role: "starter" | "bench", courtPosition: number): LineupPlayer => ({
      fantasyId: courtPosition, playerId, name, pos: "G", role, courtPosition, isCaptain: false, isSixthMan: courtPosition === 6, pts: 10,
    });
    const rosters = new Map<number, RosterRef>([
      [1, { teamId: "bol", slot: "starter" }],
      [2, { teamId: "bol", slot: "starter" }],
      [3, { teamId: "bol", slot: "reserve" }],
      [4, { teamId: "okc", slot: "starter" }],
      [6, { teamId: "bol", slot: "starter" }],
      [7, { teamId: "bol", slot: "starter" }],
    ]);
    const c = checkLineup("bol", [lp(2, "Due", "starter", 2), lp(1, "Uno", "starter", 1), lp(3, "Tre", "bench", 6), lp(4, "Quattro", "bench", 7), lp(5, "Cinque", "bench", 8), lp(null, "Ignoto", "bench", 9)], [1, 2, 6, 7], rosters);
    expect(c.starters.map((x) => x.name)).toEqual(["Uno", "Due"]);
    expect(c.bench.map((x) => x.status)).toEqual(["reserve", "other_team", "free", "unlinked"]);
    expect(c.bench[1].otherTeamId).toBe("okc");
    expect(c.stands).toEqual([6, 7]);
    expect(c.issues.map((x) => x.name)).toEqual(["Tre", "Quattro", "Cinque", "Ignoto"]);
  });
});

describe("rose Dunkest", () => {
  it("parseTeamRoster: 13 giocatori di un'altra squadra, con ruolo", () => {
    const r = parseTeamRoster(fx.teamRoster);
    expect(r).toHaveLength(13);
    expect(r.find((p) => p.lastName === "Claxton")).toEqual({ fantasyId: 130, firstName: "Nicolas", lastName: "Claxton", pos: "C" });
    expect(parseTeamRoster({ data: [] })).toEqual([]);
    expect(() => parseTeamRoster({ data: {} })).toThrow(SourceFormatError);
  });

  it("buildLeaguePayload: rose per squadra e collegamenti trovati anche dai giocatori in tribuna", () => {
    const payload = buildLeaguePayload({
      seasonId: 1,
      teams: TEAMS,
      players: [p(20, "Darius", "Garland"), p(21, "Nic", "Claxton", 130)],
      standings: parseStandings(fx.standings),
      matchdays: [],
      details: [],
      full: false,
      rosters: [{ dunkestTeamId: 3233688, players: parseTeamRoster(fx.teamRoster) }],
    });
    expect(payload.rosters).toHaveLength(13);
    expect(payload.rosters!.every((r) => r.team_id === "asf")).toBe(true);
    expect(payload.rosters!.find((r) => r.name === "Darius Garland")?.player_id).toBe(20);
    // Claxton: nome diverso, collegato dall'id già salvato
    expect(payload.rosters!.find((r) => r.fantasy_player_id === 130)?.player_id).toBe(21);
    expect(payload.links).toContainEqual({ player_id: 20, fantasy_id: 37 });
    // Senza rose la chiave manca: la RPC lascia quelle di prima.
    expect("rosters" in buildLeaguePayload({ seasonId: 1, teams: TEAMS, players: [], standings: parseStandings(fx.standings), matchdays: [], details: [], full: false })).toBe(false);
  });
});

describe("rosterAlignment", () => {
  // Squadra di prova: 13 titolari (5G/5A/3C, id 1-13) e 3 riserve (id 14-16, una per ruolo).
  const POS: Position[] = ["G", "G", "G", "G", "G", "A", "A", "A", "A", "A", "C", "C", "C", "G", "A", "C"];
  const contracts: AlignContract[] = POS.map((pos, i) => ({
    contractId: 100 + i, playerId: i + 1, name: `Gioc ${i + 1}`, pos, slot: i < 13 ? "starter" : "reserve", salary: i < 13 ? 18 : 10,
  }));
  const team = { contracts, cuts: [], bonus: 0 };
  const rosters = new Map<number, RosterRef>(contracts.map((c) => [c.playerId, { teamId: "bol", slot: c.slot }]));
  rosters.set(99, { teamId: "okc", slot: "starter" });
  const dk = (ids: (number | null)[]): DunkestRosterPlayer[] => ids.map((id, i) => ({ fantasyId: 1000 + i, playerId: id, name: id === null ? "Ignoto" : `Gioc ${id}`, pos: null }));
  const names = (id: string) => (id === "okc" ? "OKCC" : "?");

  it("già allineata: niente da fare", () => {
    const a = rosterAlignment("bol", team, dk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), rosters, names, DEFAULT_SETTINGS);
    expect(a).toMatchObject({ promote: [], demote: [], blockers: [], warnings: [] });
  });

  it("riserve in rosa Dunkest salgono, titolari assenti scendono, ruolo per ruolo; cap sforato = avviso", () => {
    // 14 (G), 15 (A), 16 (C) al posto di 1 (G), 6 (A), 11 (C): monte 234 → 210, riserve 30 → 54.
    const a = rosterAlignment("bol", team, dk([14, 2, 3, 4, 5, 15, 7, 8, 9, 10, 16, 12, 13]), rosters, names, DEFAULT_SETTINGS);
    expect(a.promote.map((c) => c.playerId)).toEqual([14, 15, 16]);
    expect(a.demote.map((c) => c.playerId)).toEqual([1, 6, 11]);
    expect(a.blockers).toEqual([]);
    expect([a.before.payroll, a.after.payroll, a.after.reserveSpace]).toEqual([234, 210, 26]);
    expect(a.warnings).toEqual([]);
    const rich = { ...team, contracts: contracts.map((c) => (c.playerId === 14 ? { ...c, salary: 60 } : c)) };
    const b = rosterAlignment("bol", rich, dk([14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), rosters, names, DEFAULT_SETTINGS);
    expect(b.blockers).toEqual([]);
    expect(b.warnings.join(" ")).toMatch(/supera il cap.*R-10/);
  });

  it("blocchi: non collegato, di un'altra squadra, rosa incompleta, ruoli oltre il massimo", () => {
    const a = rosterAlignment("bol", team, dk([null, 99, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), rosters, names, DEFAULT_SETTINGS);
    expect(a.blockers).toEqual(["Ignoto non è collegato a un giocatore della lega.", "Gioc 99 è nella rosa Dunkest ma nell'app è di OKCC."]);
    expect(rosterAlignment("bol", team, dk([1, 2, 3]), rosters, names, DEFAULT_SETTINGS).blockers[0]).toMatch(/3 giocatori invece di 13/);
    // La riserva G (14) al posto di un centro (11): titolari G 6/5.
    const roles = rosterAlignment("bol", team, dk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 12, 13]), rosters, names, DEFAULT_SETTINGS);
    expect(roles.blockers.join(" ")).toMatch(/Titolari G: 6/);
  });

  it("tribune: dalla rosa Dunkest se c'è, altrimenti titolari dell'app non schierati", () => {
    const lineup: LineupPlayer[] = [{ fantasyId: 1000, playerId: 1, name: "Gioc 1", pos: "G", role: "starter", courtPosition: 1, isCaptain: false, isSixthMan: false, pts: 1 }];
    const roster = dk([1, 2]);
    expect(tribune(lineup, roster, [], { starters: [], bench: [], stands: [], issues: [] })).toEqual({ fromDunkest: true, players: [{ id: 1001, name: "Gioc 2", pos: null }] });
    expect(tribune(lineup, undefined, [{ playerId: 7, name: "Sette", pos: "A" }], { starters: [], bench: [], stands: [7], issues: [] })).toEqual({ fromDunkest: false, players: [{ id: 7, name: "Sette", pos: "A" }] });
  });
});
