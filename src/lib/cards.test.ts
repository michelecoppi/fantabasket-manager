import { describe, expect, it } from "vitest";
import type { LeagueMatch, LineupPlayer } from "./dunkest-league";
import type { Award } from "./awards";
import { awardsCardModel, cardPoints, displayWidth, fitDisplaySize, mvpCardModel, shortName, splitName, splitPoints } from "./cards";

const match = (id: number, home: string, away: string): LeagueMatch => ({ id, matchday: 4, homeTeamId: home, awayTeamId: away, homePts: 400, awayPts: 380, winnerTeamId: home });
const player = (name: string, pts: number | null, over: Partial<LineupPlayer> = {}): LineupPlayer => ({
  fantasyId: 1,
  playerId: null,
  name,
  pos: "C",
  role: "starter",
  courtPosition: 1,
  isCaptain: false,
  isSixthMan: false,
  pts,
  ...over,
});
const teams = new Map([
  ["a", { name: "Bol Bollerz", color: "#1d47b5" }],
  ["b", { name: "OKCC", color: "#c75d0c" }],
]);
const lineups = (a: LineupPlayer[], b: LineupPlayer[]) => new Map([[1, new Map([["a", a], ["b", b]])]]);
const build = (a: LineupPlayer[], b: LineupPlayer[], provisional = false) =>
  mvpCardModel({ matchday: 4, provisional, matches: [match(1, "a", "b")], lineups: lineups(a, b), teams });

describe("nomi", () => {
  it("divide nome e cognome, anche composti", () => {
    expect(splitName("Nikola Jokić")).toEqual({ first: "Nikola", last: "Jokić" });
    expect(splitName("Shai Gilgeous-Alexander")).toEqual({ first: "Shai", last: "Gilgeous-Alexander" });
    expect(splitName("Jaren Jackson Jr.")).toEqual({ first: "Jaren", last: "Jackson Jr." });
    expect(splitName("Jokić")).toEqual({ first: "", last: "Jokić" });
  });
  it("abbrevia il nome per la riga dei piazzamenti", () => {
    expect(shortName("Luka Dončić")).toBe("L. Dončić");
    expect(shortName("Jokić")).toBe("Jokić");
  });
});

describe("larghezza del titolo", () => {
  it("misura lettera per lettera: la M e la W pesano più della I", () => {
    expect(displayWidth("WWW", 100)).toBeGreaterThan(displayWidth("III", 100) * 3);
    expect(displayWidth("Dončić", 100)).toBeCloseTo(displayWidth("DONCIC", 100));
  });
  it("tiene i cognomi corti al massimo e restringe quelli lunghi", () => {
    expect(fitDisplaySize("Yao", 660, 156, 56, 1)).toBe(156);
    const wemby = fitDisplaySize("Wembanyama", 660, 156, 56, 1);
    expect(wemby).toBeLessThan(120);
    expect(displayWidth("Wembanyama", wemby, 1)).toBeLessThanOrEqual(660);
    expect(fitDisplaySize("Gilgeous-Alexander", 660, 156, 56, 1)).toBeGreaterThanOrEqual(56);
  });
});

describe("punti", () => {
  it("separa intero e decimali con la virgola", () => {
    expect(splitPoints(68.5)).toEqual({ whole: "68", decimals: "5" });
    expect(splitPoints(72.19)).toEqual({ whole: "72", decimals: "19" });
    expect(splitPoints(41)).toEqual({ whole: "41", decimals: "0" });
  });
  it("arrotonda ai centesimi come Dunkest", () => {
    expect(cardPoints(61)).toBe("61,0");
    expect(cardPoints(58.499999)).toBe("58,5");
    expect(cardPoints(1234.5)).toBe("1234,5");
  });
});

describe("mvpCardModel", () => {
  it("prende il giocatore con più punti e i tre dietro", () => {
    const m = build(
      [player("Nikola Jokić", 68.5), player("Aaron Gordon", 20)],
      [player("Luka Dončić", 61), player("Shai Gilgeous-Alexander", 58.5), player("Jalen Williams", 57), player("Chet Holmgren", 12)],
    );
    expect(m).toMatchObject({ matchday: 4, first: "Nikola", last: "Jokić", teamName: "Bol Bollerz", teamColor: "#1d47b5", pts: 68.5, position: "Centro", role: "In quintetto", tiedWith: [] });
    expect(m?.runnersUp.map((r) => [r.name, r.teamName, r.pts])).toEqual([
      ["L. Dončić", "OKCC", 61],
      ["S. Gilgeous-Alexander", "OKCC", 58.5],
      ["J. Williams", "OKCC", 57],
    ]);
  });

  it("dice il ruolo in formazione: capitano, sesto uomo, panchina", () => {
    expect(build([player("A B", 70, { isCaptain: true })], [player("C D", 10)])?.role).toBe("Capitano");
    expect(build([player("A B", 70, { isSixthMan: true, role: "bench" })], [player("C D", 10)])?.role).toBe("Sesto uomo");
    expect(build([player("A B", 70, { role: "bench" })], [player("C D", 10)])?.role).toBe("Panchina");
  });

  it("a pari punti il premio è condiviso e i pari merito non finiscono tra i piazzamenti", () => {
    const m = build([player("Nikola Jokić", 60)], [player("Luka Dončić", 60), player("Jalen Williams", 50)]);
    expect(m?.tiedWith).toHaveLength(1);
    expect(m?.runnersUp.map((r) => r.name)).toEqual(["J. Williams"]);
  });

  it("ignora chi non ha punti e senza formazioni non c'è nessuna card", () => {
    expect(build([player("Nikola Jokić", null)], [player("Luka Dončić", null)])).toBeNull();
    expect(mvpCardModel({ matchday: 1, provisional: false, matches: [match(1, "a", "b")], lineups: new Map(), teams })).toBeNull();
  });

  it("segna la giornata provvisoria e ha meno di tre piazzamenti se i giocatori sono pochi", () => {
    const m = build([player("Nikola Jokić", 68.5)], [player("Luka Dončić", 61)], true);
    expect(m?.provisional).toBe(true);
    expect(m?.runnersUp).toHaveLength(1);
  });

  it("senza ruolo noto non scrive la posizione", () => {
    expect(build([player("Nikola Jokić", 68.5, { pos: null })], [player("Luka Dončić", 61)])?.position).toBeNull();
  });
});

describe("awardsCardModel", () => {
  const w = (teamId: string, value: number, extra: Record<string, unknown> = {}) => ({ teamId, value, ...extra });
  const awards: Award[] = [
    { kind: "photo_finish", winners: [w("a", 0.5, { vsTeamId: "b" })] },
    { kind: "mvp", winners: [w("a", 68.5, { name: "Nikola Jokić" })] },
    { kind: "captain_worst", winners: [w("b", 2, { name: "Gary Trent" })] },
    { kind: "team_best", winners: [w("a", 431.5, { vsTeamId: "b" })] },
  ];
  const m = awardsCardModel({ matchday: 4, provisional: false, awards, teams });

  it("mette l'MVP nella tessera grande e gli altri premi nell'ordine della bacheca", () => {
    expect(m?.hero).toMatchObject({ kind: "mvp", title: "Nikola Jokić", subtitle: "Bol Bollerz", value: 68.5, margin: false, player: true });
    expect(m?.tiles.map((t) => t.kind)).toEqual(["captain_worst", "team_best", "photo_finish"]);
  });

  it("scrive il contesto dei premi di squadra e di scontro", () => {
    const by = Object.fromEntries((m?.tiles ?? []).map((t) => [t.kind, t]));
    expect(by.team_best).toMatchObject({ title: "Bol Bollerz", subtitle: "contro OKCC", margin: false, player: false });
    expect(by.photo_finish).toMatchObject({ title: "Bol Bollerz", subtitle: "su OKCC", margin: true });
    expect(by.captain_worst).toMatchObject({ title: "Gary Trent", subtitle: "OKCC" });
  });

  it("senza formazioni la squadra della giornata fa da tessera grande", () => {
    const only = awardsCardModel({ matchday: 1, provisional: false, awards: [awards[3], awards[0]], teams });
    expect(only?.hero.kind).toBe("team_best");
    expect(only?.tiles.map((t) => t.kind)).toEqual(["photo_finish"]);
  });

  it("conta i pari merito e non inventa premi", () => {
    const tied = awardsCardModel({ matchday: 4, provisional: true, awards: [{ kind: "mvp", winners: [w("a", 60, { name: "A B" }), w("b", 60, { name: "C D" })] }], teams });
    expect(tied?.hero.more).toBe(1);
    expect(tied?.provisional).toBe(true);
    expect(awardsCardModel({ matchday: 4, provisional: false, awards: [], teams })).toBeNull();
  });
});
