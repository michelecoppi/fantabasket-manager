import { describe, expect, it } from "vitest";
import { buildLeagueView, type LeagueMatch } from "./dunkest-league";
import { VIEW } from "./fixtures/fase6";
import { headToHead, meetings, precedents, rivalryBadges } from "./rivalries";

describe("rivalità (6.3)", () => {
  it("testa a testa sui dati veri: una riga per avversaria, solo giornate giocate", () => {
    const rows = headToHead(VIEW, "bol");
    expect(rows.map((r) => r.opponentId)).toEqual(["ann", "dam", "cus", "asf", "spa", "okc", "sas"]);
    const ann = rows.find((r) => r.opponentId === "ann")!;
    expect([ann.wins, ann.draws, ann.losses]).toEqual([0, 0, 1]);
    expect(ann.pointsFor).toBeCloseTo(233.15, 2);
    // la giornata 4 (0,00–0,00, latest) non conta ma è la prossima sfida con San Antonio
    const sas = rows.find((r) => r.opponentId === "sas")!;
    expect(sas.meetings).toEqual([]);
    expect(sas.next).toBe(4);
    expect(rows.find((r) => r.opponentId === "okc")!.next).toBe(5);
  });

  it("con una sfida per avversaria nessun badge", () => {
    expect(rivalryBadges(headToHead(VIEW, "bol"))).toEqual({ nemesis: null, victim: null });
  });

  const m = (id: number, matchday: number, h: string, hp: number, a: string, ap: number): LeagueMatch => ({ id, matchday, homeTeamId: h, awayTeamId: a, homePts: hp, awayPts: ap, winnerTeamId: hp === ap ? null : hp > ap ? h : a });
  const long = buildLeagueView(
    null,
    ["a", "b", "c"].map((teamId, i) => ({ teamId, position: i + 1, totalPts: 0, wins: 0, draws: 0, losses: 0 })),
    [m(1, 1, "a", 100, "b", 120), m(2, 2, "b", 110, "a", 90), m(3, 3, "a", 100, "c", 80), m(4, 4, "c", 70, "a", 90), m(5, 5, "a", 100, "b", 100), m(6, 6, "a", 1, "c", 1)],
  );

  it("bestia nera e vittima preferita da 2 sfide in su", () => {
    const rows = headToHead(long, "a");
    const b = rows.find((r) => r.opponentId === "b")!;
    // la giornata 6 è latest: non conta
    expect([b.wins, b.draws, b.losses]).toEqual([0, 1, 2]);
    const badges = rivalryBadges(rows);
    expect(badges.nemesis?.opponentId).toBe("b");
    expect(badges.victim?.opponentId).toBe("c");
  });

  it("pareggio esatto sui criteri: nessun badge", () => {
    const tie = buildLeagueView(null, [], [m(1, 1, "a", 100, "b", 90), m(2, 2, "a", 100, "c", 90), m(3, 3, "b", 90, "a", 100), m(4, 4, "c", 90, "a", 100), m(5, 5, "a", 0, "b", 0)]);
    expect(rivalryBadges(headToHead({ ...tie, standings: ["a", "b", "c"].map((teamId, i) => ({ teamId, position: i + 1, totalPts: 0, wins: 0, draws: 0, losses: 0 })) }, "a")).victim).toBeNull();
  });

  it("precedenti prima di una giornata, dal punto di vista di chi gioca in casa", () => {
    expect(precedents(long, "a", "b", 5)).toEqual({ played: 2, homeWins: 0, awayWins: 2, draws: 0 });
    expect(precedents(long, "b", "a", 2)).toEqual({ played: 1, homeWins: 1, awayWins: 0, draws: 0 });
    expect(precedents(long, "a", "b", 1).played).toBe(0);
    expect(meetings(long, "a", "b").map((x) => x.outcome)).toEqual(["L", "L", "D"]);
  });
});
