import { describe, expect, it } from "vitest";
import { DEFAULT_OWNER, DEFAULT_SORT, filterPlayers, filtersHref, parseFilters, type PlayerFilters, type PlayerListItem } from "./players";

const mk = (id: number, name: string, over: Partial<PlayerListItem> = {}): PlayerListItem => ({
  id, name, pos: "G", nbaTeam: "LAL", credits: 10, ownerTeamId: null, talentTeamId: null, cutByTeamId: null, restrictedTeamId: null, lastContract: null, ...over,
});
const base: PlayerFilters = { q: "", pos: [], nbaTeam: "", owner: "all", sort: "credits", dir: "desc" };

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
    expect(filterPlayers(all, { ...base, pos: ["C"] }).map((p) => p.id)).toEqual([2]);
    expect(filterPlayers(all, { ...base, nbaTeam: "NYK" }).map((p) => p.id)).toEqual([3]);
    expect(filterPlayers(all, { ...base, owner: "taken" }).map((p) => p.id)).toEqual([1]);
    expect(filterPlayers(all, { ...base, owner: "free" }).map((p) => p.id)).toEqual([2, 3, 4]);
  });
  it("più ruoli insieme: basta uno dei ruoli scelti, senza ruolo escluso", () => {
    const roles = [mk(1, "G", { pos: "G" }), mk(2, "A", { pos: "A" }), mk(3, "C", { pos: "C" }), mk(4, "Provvisorio", { pos: null })];
    // a pari crediti l'ordine è per nome (A, C, G, Provvisorio)
    expect(filterPlayers(roles, { ...base, pos: ["G", "A"] }).map((p) => p.id)).toEqual([2, 1]);
    expect(filterPlayers(roles, { ...base, pos: [] }).map((p) => p.id)).toEqual([2, 3, 1, 4]);
  });
  it("ordina per punteggio Dunkest, chi non ha giocato in fondo (per crediti)", () => {
    const scored = [mk(1, "A", { pdk: 20 }), mk(2, "B", { pdk: null, credits: 30 }), mk(3, "C", { pdk: 35.5 }), mk(4, "D", { credits: 5 })];
    expect(filterPlayers(scored, { ...base, sort: "pdk" }).map((p) => p.id)).toEqual([3, 1, 2, 4]);
    expect(parseFilters({ ordina: "pdk" }).sort).toBe("pdk");
  });
  it("ordina per nome", () => {
    expect(filterPlayers(all, { ...base, sort: "name", dir: "asc" }).map((p) => p.id)).toEqual([3, 1, 2, 4]);
  });
});

describe("verso dell'ordinamento", () => {
  const scored = [mk(1, "A", { pdk: 20, credits: 5 }), mk(2, "B", { pdk: null, credits: 30 }), mk(3, "C", { pdk: 35.5, credits: null }), mk(4, "D", { pdk: 10, credits: 12 })];
  const ids = (f: Partial<PlayerFilters>) => filterPlayers(scored, { ...base, ...f }).map((p) => p.id);
  it("punteggio dal maggiore e dal minore: chi non ha giocato resta in fondo", () => {
    expect(ids({ sort: "pdk", dir: "desc" })).toEqual([3, 1, 4, 2]);
    expect(ids({ sort: "pdk", dir: "asc" })).toEqual([4, 1, 3, 2]);
  });
  it("crediti dal maggiore e dal minore: chi non li ha resta in fondo", () => {
    expect(ids({ sort: "credits", dir: "desc" })).toEqual([2, 4, 1, 3]);
    expect(ids({ sort: "credits", dir: "asc" })).toEqual([1, 4, 2, 3]);
  });
  it("nome A-Z e Z-A", () => {
    expect(ids({ sort: "name", dir: "asc" })).toEqual([1, 2, 3, 4]);
    expect(ids({ sort: "name", dir: "desc" })).toEqual([4, 3, 2, 1]);
  });
  it("il verso naturale non sta nell'URL, l'altro sì, e si rilegge", () => {
    expect(filtersHref({ ...base, sort: "pdk", dir: "desc" })).toBe("/giocatori");
    expect(filtersHref({ ...base, sort: "pdk", dir: "asc" })).toBe("/giocatori?dir=asc");
    expect(filtersHref({ ...base, sort: "name", dir: "desc" })).toBe("/giocatori?ordina=name&dir=desc");
    expect(parseFilters({ ordina: "name" }).dir).toBe("asc");
    expect(parseFilters({ ordina: "credits" }).dir).toBe("desc");
    expect(parseFilters({ dir: "asc" })).toMatchObject({ sort: "pdk", dir: "asc" });
    expect(parseFilters({ dir: "boh" }).dir).toBe("desc");
  });
  it("la squadra NBA si legge col nome intero", () => {
    expect(parseFilters({ nba: "Golden State Warriors" }).nbaTeam).toBe("Golden State Warriors");
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

describe("filtersHref", () => {
  it("omette i default e rilegge gli stessi filtri con parseFilters", () => {
    expect(filtersHref({ ...base, owner: DEFAULT_OWNER, sort: DEFAULT_SORT })).toBe("/giocatori");
    const f = { q: "lu", pos: ["G", "A"] as const, nbaTeam: "BOS", owner: "free" as const, sort: "name" as const, dir: "asc" as const };
    const href = filtersHref({ ...f, pos: [...f.pos] });
    expect(href).toBe("/giocatori?q=lu&ruolo=G&ruolo=A&nba=BOS&stato=free&ordina=name");
    expect(parseFilters(Object.fromEntries(new URLSearchParams(href.split("?")[1]).entries()))).toMatchObject({ q: "lu", nbaTeam: "BOS", owner: "free", sort: "name" });
  });
  it("stato diverso dal default resta nell'URL, anche 'tutti' se il default cambia", () => {
    expect(filtersHref({ ...base, owner: "taken", sort: DEFAULT_SORT })).toBe("/giocatori?stato=taken");
    expect(filtersHref({ ...base, owner: DEFAULT_OWNER, sort: "credits" })).toBe("/giocatori?ordina=credits");
  });
});

describe("parseFilters", () => {
  it("scarta valori non validi", () => {
    expect(parseFilters({ ruolo: "X", stato: "boh", ordina: "?" })).toEqual({ ...base, owner: DEFAULT_OWNER, sort: DEFAULT_SORT });
  });
  it("default: tutti gli stati, ordinati per punteggio Dunkest (chi è in rosa non ha crediti)", () => {
    expect(parseFilters({})).toMatchObject({ owner: "all", sort: "pdk", pos: [] });
    expect(parseFilters({ ordina: "credits" }).sort).toBe("credits");
  });
  it("ruolo ripetuto: tiene i validi, una volta sola, in ordine fisso", () => {
    expect(parseFilters({ ruolo: ["A", "G", "A", "X"] }).pos).toEqual(["G", "A"]);
    expect(parseFilters({ ruolo: "C" }).pos).toEqual(["C"]);
  });
  it("ignora un vecchio ?pagina= (il listone ha lo scroll infinito)", () => {
    expect(parseFilters({ pagina: "3" })).toEqual({ ...base, owner: DEFAULT_OWNER, sort: DEFAULT_SORT });
  });
  it("legge valori validi", () => {
    expect(parseFilters({ q: "lu", ruolo: "A", nba: "BOS", stato: "free", ordina: "name" })).toEqual({
      q: "lu", pos: ["A"], nbaTeam: "BOS", owner: "free", sort: "name", dir: "asc",
    });
  });
});
