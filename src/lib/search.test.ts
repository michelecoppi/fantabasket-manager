import { describe, expect, it } from "vitest";
import { normalize, searchLeague, type SearchIndex } from "./search";

const index: SearchIndex = {
  teams: [
    { id: "t1", name: "Bol Bollerz", owner: "Gabby" },
    { id: "t2", name: "Chicago Spaccinos", owner: "Serde" },
  ],
  players: [
    { id: 1, name: "Nikola Jokić", pos: "C", nbaTeam: "DEN", ownerTeamId: "t1", credits: 33 },
    { id: 2, name: "Luka Dončić", pos: "G", nbaTeam: "LAL", ownerTeamId: null, credits: 30 },
    { id: 3, name: "Bol Bol", pos: "C", nbaTeam: "PHX", ownerTeamId: null, credits: 2 },
    { id: 4, name: "Jaime Jaquez Jr.", pos: "A", nbaTeam: "MIA", ownerTeamId: "t2", credits: 8 },
    { id: 5, name: "Senza Crediti", pos: null, nbaTeam: null, ownerTeamId: null, credits: null },
    { id: 6, name: "Marco Bajano", pos: "G", nbaTeam: null, ownerTeamId: null, credits: 20 },
  ],
};

const ids = (q: string) => searchLeague(index, q).map((h) => (h.kind === "team" ? h.team.id : h.player.id));

describe("normalize", () => {
  it("toglie accenti, maiuscole e punteggiatura", () => {
    expect(normalize("  Dončić Jr. ")).toBe("doncic jr");
  });
});

describe("searchLeague", () => {
  it("query vuota: nessun risultato", () => {
    expect(ids("   ")).toEqual([]);
  });
  it("ignora accenti e maiuscole", () => {
    expect(ids("DONCIC")).toEqual([2]);
    expect(ids("jokic")).toEqual([1]);
  });
  it("trova le squadre anche dal proprietario, prima dei giocatori", () => {
    expect(ids("gabby")).toEqual(["t1"]);
    expect(ids("bol")).toEqual(["t1", 3]);
  });
  it("ogni parola deve comparire, in qualsiasi ordine", () => {
    expect(ids("jr jaquez")).toEqual([4]);
    expect(ids("jaquez lal")).toEqual([]);
  });
  it("chi inizia una parola viene prima di chi la contiene in mezzo, anche se vale di più", () => {
    expect(ids("ja")).toEqual([4, 6]);
  });
  it("a parità ordina per crediti, senza crediti in fondo", () => {
    expect(ids("i")).toEqual(["t2", 1, 2, 4, 5]);
  });
  it("rispetta il limite", () => {
    expect(searchLeague(index, "a", 2)).toHaveLength(2);
  });
});
