import { describe, expect, it } from "vitest";
import { buildLeagueView, type LeagueMatch } from "./dunkest-league";
import { STANDINGS, VIEW } from "./fixtures/fase6";
import { checkOfficial, standingsByMatchday, teamPositions } from "./standings-history";

describe("andamento in classifica (6.4)", () => {
  const history = standingsByMatchday(VIEW);

  it("una colonna per giornata giocata (la 4 è in corso)", () => {
    expect(history.map((h) => h.matchday)).toEqual([1, 2, 3]);
  });

  it("l'ultima giornata ricostruita coincide con la classifica ufficiale del 2026-10-29", () => {
    const last = history[2].rows;
    expect(last.map((r) => r.teamId)).toEqual(STANDINGS.map((s) => s.teamId));
    expect(last.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(last[1].totalPts).toBeCloseTo(761, 2);
    expect(checkOfficial(history, STANDINGS)).toBe("ok");
  });

  it("posizioni giornata per giornata", () => {
    expect(teamPositions(history, "bol").map((x) => x.position)).toEqual([4, 5, 5]);
    expect(teamPositions(history, "ann").map((x) => x.position)).toEqual([3, 3, 1]);
  });

  it("classifica ufficiale diversa: mismatch; con partite in più: pending", () => {
    const swapped = STANDINGS.map((s) => (s.teamId === "okc" ? { ...s, position: 8 } : s.teamId === "sas" ? { ...s, position: 7 } : s));
    expect(checkOfficial(history, swapped)).toBe("mismatch");
    const ahead = STANDINGS.map((s) => ({ ...s, wins: s.wins + 1 }));
    expect(checkOfficial(history, ahead)).toBe("pending");
    expect(checkOfficial([], STANDINGS.map((s) => ({ ...s, wins: 0, losses: 0 })))).toBe("ok");
  });

  it("pareggio = mezza vittoria (ASSUNZIONE), a pari valore posizione condivisa", () => {
    const m = (id: number, matchday: number, h: string, hp: number, a: string, ap: number): LeagueMatch => ({ id, matchday, homeTeamId: h, awayTeamId: a, homePts: hp, awayPts: ap, winnerTeamId: hp === ap ? null : hp > ap ? h : a });
    const v = buildLeagueView(null, [], [m(1, 1, "a", 100, "b", 100), m(2, 1, "c", 120, "d", 90), m(3, 2, "a", 0, "c", 0)]);
    const [day1] = standingsByMatchday(v);
    expect(day1.rows.map((r) => [r.teamId, r.position])).toEqual([
      ["c", 1],
      ["a", 2],
      ["b", 2],
      ["d", 4],
    ]);
  });
});
