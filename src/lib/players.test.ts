import { describe, expect, it } from "vitest";
import { filterPlayers, parseFilters, type PlayerFilters, type PlayerListItem } from "./players";

const mk = (id: number, name: string, over: Partial<PlayerListItem> = {}): PlayerListItem => ({
  id, name, pos: "G", nbaTeam: "LAL", credits: 10, ownerTeamId: null, cutByTeamId: null, restrictedTeamId: null, ...over,
});
const base: PlayerFilters = { q: "", pos: "", nbaTeam: "", owner: "all", sort: "credits" };

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
  it("ordina per nome", () => {
    expect(filterPlayers(all, { ...base, sort: "name" }).map((p) => p.id)).toEqual([3, 1, 2, 4]);
  });
});

describe("parseFilters", () => {
  it("scarta valori non validi", () => {
    expect(parseFilters({ ruolo: "X", stato: "boh", ordina: "?" })).toEqual(base);
  });
  it("legge valori validi", () => {
    expect(parseFilters({ q: "lu", ruolo: "A", nba: "BOS", stato: "free", ordina: "name" })).toEqual({
      q: "lu", pos: "A", nbaTeam: "BOS", owner: "free", sort: "name",
    });
  });
});
