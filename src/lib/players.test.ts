import { describe, expect, it } from "vitest";
import { filterPlayers, parseFilters, type PlayerFilters, type PlayerListItem } from "./players";

const mk = (id: number, name: string, over: Partial<PlayerListItem> = {}): PlayerListItem => ({
  id, name, pos: "G", nbaTeam: "LAL", credits: 10, ownerTeamId: null, talentTeamId: null, cutByTeamId: null, restrictedTeamId: null, lastContract: null, ...over,
});
const base: PlayerFilters = { q: "", pos: "", nbaTeam: "", owner: "all", sort: "credits", page: 1 };

const all = [
  mk(1, "Luka Dončić", { credits: 30, ownerTeamId: "t1" }),
  mk(2, "Nikola Jokić", { pos: "C", nbaTeam: "DEN", credits: 33 }),
  mk(3, "Jalen Brunson", { nbaTeam: "NYK", credits: 22.5 }),
  mk(4, "Senza crediti", { credits: null }),
];

describe("filterPlayers", () => {
  it("ordina per crediti decrescenti, senza crediti in fondo", () => {
    expect(filterPlayers(all, base).map((p) => p.id)).toEqual([2, 1, 3, 4]);
  });
  it("cerca ignorando accenti e maiuscole", () => {
    expect(filterPlayers(all, { ...base, q: "doncic" }).map((p) => p.id)).toEqual([1]);
    expect(filterPlayers(all, { ...base, q: "JOKIC" }).map((p) => p.id)).toEqual([2]);
  });
  it("filtra per ruolo, squadra NBA e stato", () => {
    expect(filterPlayers(all, { ...base, pos: "C" }).map((p) => p.id)).toEqual([2]);
    expect(filterPlayers(all, { ...base, nbaTeam: "NYK" }).map((p) => p.id)).toEqual([3]);
    expect(filterPlayers(all, { ...base, owner: "taken" }).map((p) => p.id)).toEqual([1]);
    expect(filterPlayers(all, { ...base, owner: "free" }).map((p) => p.id)).toEqual([2, 3, 4]);
  });
  it("ordina per punteggio Dunkest, chi non ha giocato in fondo (per crediti)", () => {
    const scored = [mk(1, "A", { pdk: 20 }), mk(2, "B", { pdk: null, credits: 30 }), mk(3, "C", { pdk: 35.5 }), mk(4, "D", { credits: 5 })];
    expect(filterPlayers(scored, { ...base, sort: "pdk" }).map((p) => p.id)).toEqual([3, 1, 2, 4]);
    expect(parseFilters({ ordina: "pdk" }).sort).toBe("pdk");
  });
  it("ordina per nome", () => {
    expect(filterPlayers(all, { ...base, sort: "name" }).map((p) => p.id)).toEqual([3, 1, 2, 4]);
  });
});

describe("stati distinti", () => {
  const mixed = [
    mk(1, "A", { ownerTeamId: "t1" }),
    mk(2, "B", { cutByTeamId: "t1" }),
    mk(3, "C", { restrictedTeamId: "t1" }),
    mk(4, "D"),
  ];
  it("un talento collegato al listone non è libero (R-35)", () => {
    const withTalent = [...mixed, mk(5, "E", { talentTeamId: "t2" })];
    expect(filterPlayers(withTalent, { ...base, owner: "free" }).map((p) => p.id)).toEqual([2, 3, 4]);
    expect(filterPlayers(withTalent, { ...base, owner: "open" }).map((p) => p.id)).toEqual([4]);
    expect(filterPlayers(withTalent, { ...base, owner: "talent" }).map((p) => p.id)).toEqual([5]);
    expect(parseFilters({ stato: "talent" }).owner).toBe("talent");
  });
  it("free = senza contratto, open = solo liberi senza vincoli", () => {
    expect(filterPlayers(mixed, { ...base, owner: "free" }).map((p) => p.id)).toEqual([2, 3, 4]);
    expect(filterPlayers(mixed, { ...base, owner: "open" }).map((p) => p.id)).toEqual([4]);
    expect(filterPlayers(mixed, { ...base, owner: "cut" }).map((p) => p.id)).toEqual([2]);
    expect(filterPlayers(mixed, { ...base, owner: "restricted" }).map((p) => p.id)).toEqual([3]);
  });
});

describe("parseFilters", () => {
  it("scarta valori non validi", () => {
    expect(parseFilters({ ruolo: "X", stato: "boh", ordina: "?" })).toEqual(base);
  });
  it("legge e limita la pagina", () => {
    expect(parseFilters({ pagina: "3" }).page).toBe(3);
    expect(parseFilters({ pagina: "-2" }).page).toBe(1);
    expect(parseFilters({ pagina: "abc" }).page).toBe(1);
  });
  it("legge valori validi", () => {
    expect(parseFilters({ q: "lu", ruolo: "A", nba: "BOS", stato: "free", ordina: "name" })).toEqual({
      q: "lu", pos: "A", nbaTeam: "BOS", owner: "free", sort: "name", page: 1,
    });
  });
});
