import { describe, expect, it } from "vitest";
import { matchdayAwards, hasPlayerAwards, seasonTrophies, type Award, type AwardKind } from "./awards";
import type { LineupPlayer } from "./dunkest-league";
import { MATCHES } from "./fixtures/fase6";

// Formazioni ridotte della giornata 3 (dati veri del 2026-10-29): quintetto in parte, sesto uomo, panchina e capitano.
let fid = 0;
const p = (name: string, pts: number | null, role: "starter" | "bench" = "starter", extra: Partial<LineupPlayer> = {}): LineupPlayer => ({
  fantasyId: ++fid,
  playerId: fid,
  name,
  pos: null,
  role,
  courtPosition: fid,
  isCaptain: false,
  isSixthMan: false,
  pts,
  ...extra,
});
const day3 = MATCHES.filter((m) => m.matchday === 3);
const lineups3 = new Map([
  [9, new Map([["cus", [p("Domantas Sabonis", 35.25, "starter", { isCaptain: true }), p("Stephon Castle", 22.58, "bench", { isSixthMan: true }), p("Jarrett Allen", 25.2, "bench")]], ["ann", [p("Tyrese Haliburton", 49.35, "starter", { isCaptain: true }), p("De'Aaron Fox", 17.33, "bench", { isSixthMan: true }), p("Jaden Mcdaniels", 21, "bench")]]])],
  [10, new Map([["asf", [p("Alperen Sengun", 51.19, "starter", { isCaptain: true }), p("Trae Young", 36, "bench", { isSixthMan: true })]], ["bol", [p("Luka Doncic", 72.19, "starter", { isCaptain: true }), p("Nikola Jokic", 42.5, "bench", { isSixthMan: true }), p("Toumani Camara", 21, "bench")]]])],
  [11, new Map([["dam", [p("Victor Wembanyama", 54.86), p("Giannis Antetokounmpo", 48.5, "starter", { isCaptain: true }), p("Kel'el Ware", 33.34, "bench")]], ["okc", [p("Anthony Davis", 38, "starter", { isCaptain: true }), p("Scottie Barnes", -0.25, "bench"), p("Infortunato", null, "bench")]]])],
  [12, new Map([["sas", [p("Devin Booker", 10.25, "starter", { isCaptain: true }), p("Naz Reid", 18.9, "bench", { isSixthMan: true })]], ["spa", [p("Jamal Murray", 36, "starter", { isCaptain: true }), p("Pascal Siakam", 32.03, "bench", { isSixthMan: true })]]])],
]);

const byKind = (awards: Award[]) => new Map<AwardKind, Award["winners"]>(awards.map((a) => [a.kind, a.winners]));

describe("matchdayAwards (6.1)", () => {
  const a = byKind(matchdayAwards(day3, lineups3));

  it("premi dei giocatori dalla giornata 3", () => {
    expect(a.get("mvp")).toEqual([{ teamId: "bol", name: "Luka Doncic", playerId: expect.any(Number), value: 72.19 }]);
    expect(a.get("captain_best")?.map((w) => w.name)).toEqual(["Luka Doncic"]);
    expect(a.get("captain_worst")?.map((w) => [w.name, w.value])).toEqual([["Devin Booker", 10.25]]);
    expect(a.get("sixth_man")?.map((w) => w.name)).toEqual(["Nikola Jokic"]);
    // il sesto uomo non conta come panchinaro; giocatori con punti null esclusi
    expect(a.get("bench")?.map((w) => [w.name, w.value])).toEqual([["Kel'el Ware", 33.34]]);
  });

  it("premi di squadra e di scontro dai punteggi Dunkest", () => {
    expect(a.get("team_best")).toEqual([{ teamId: "bol", value: 303.4, vsTeamId: "asf" }]);
    expect(a.get("team_worst")).toEqual([{ teamId: "sas", value: 167.92, vsTeamId: "spa" }]);
    expect(a.get("blowout")?.[0]).toMatchObject({ teamId: "dam", vsTeamId: "okc" });
    expect(a.get("blowout")?.[0].value).toBeCloseTo(97.11, 2);
    expect(a.get("photo_finish")?.[0]).toMatchObject({ teamId: "ann", vsTeamId: "cus" });
    expect(a.get("photo_finish")?.[0].value).toBeCloseTo(28.62, 2);
  });

  it("a parità di valore il premio è condiviso (anche con errori di virgola mobile)", () => {
    const tie = new Map([[9, new Map([["cus", [p("A", 30.1)]], ["ann", [p("B", 10.05 + 20.05)]]])]]);
    expect(matchdayAwards(day3, tie).find((x) => x.kind === "mvp")?.winners.map((w) => w.name)).toEqual(["A", "B"]);
  });

  it("giornata senza formazioni: solo premi di squadra e di scontro", () => {
    const day1 = matchdayAwards(MATCHES.filter((m) => m.matchday === 1), new Map());
    expect(day1.map((x) => x.kind)).toEqual(["team_best", "team_worst", "blowout", "photo_finish"]);
    expect(hasPlayerAwards(day1)).toBe(false);
    expect(hasPlayerAwards(matchdayAwards(day3, lineups3))).toBe(true);
  });

  it("giornata appena iniziata (0,00–0,00) o da giocare: nessun premio", () => {
    expect(matchdayAwards(MATCHES.filter((m) => m.matchday === 4), new Map())).toEqual([]);
    expect(matchdayAwards(MATCHES.filter((m) => m.matchday === 5), new Map())).toEqual([]);
  });

  it("con un solo capitano niente capitano di latta", () => {
    const one = new Map([[9, new Map([["cus", [p("Solo", 20, "starter", { isCaptain: true })]]])]]);
    const kinds = matchdayAwards(day3, one).map((x) => x.kind);
    expect(kinds).toContain("captain_best");
    expect(kinds).not.toContain("captain_worst");
  });
});

describe("seasonTrophies (vetrina)", () => {
  const days = [1, 2, 3, 4, 5].map((matchday) => ({
    matchday,
    state: matchday < 4 ? "played" : matchday === 4 ? "latest" : "upcoming",
    matches: MATCHES.filter((m) => m.matchday === matchday),
  }));
  const teams = ["ann", "dam", "cus", "asf", "bol", "spa", "okc", "sas"];
  const season = seasonTrophies(days, lineups3, teams);

  it("solo giornate chiuse; la 1 e la 2 qui senza formazioni", () => {
    expect(season.matchdays).toEqual([1, 2, 3]);
    expect(season.withoutLineups).toEqual([1, 2]);
  });

  it("trofei e vergogna per squadra, con la giornata", () => {
    const bol = season.teams.get("bol")!;
    expect(bol.trophies.filter((t) => t.matchday === 3).map((t) => t.kind).sort()).toEqual(["captain_best", "mvp", "sixth_man", "team_best"]);
    expect(bol.shame).toEqual([]);
    const sas = season.teams.get("sas")!;
    expect(sas.shame.map((t) => [t.kind, t.matchday])).toEqual([
      ["captain_worst", 3],
      ["team_worst", 3],
    ]);
    // la goleada della giornata 1 va ad Atlanto (vince su OKCC), il fotofinish ad Assago
    expect(season.teams.get("ann")!.trophies.some((t) => t.kind === "blowout" && t.matchday === 1)).toBe(true);
    expect(season.teams.get("asf")!.trophies.some((t) => t.kind === "photo_finish" && t.matchday === 1)).toBe(true);
  });

  it("posizione per numero di trofei, condivisa a pari numero; squadre senza trofei comprese", () => {
    const ranks = [...season.teams.values()].sort((a, b) => a.rank - b.rank);
    expect(ranks[0].teamId).toBe("bol");
    expect(season.teams.size).toBe(8);
    const counts = new Map([...season.teams.values()].map((c) => [c.teamId, c.trophies.length]));
    for (const c of season.teams.values()) {
      const better = [...counts.values()].filter((n) => n > c.trophies.length).length;
      expect(c.rank).toBe(better + 1);
    }
  });
});
