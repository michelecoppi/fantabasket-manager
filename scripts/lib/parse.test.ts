import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lettersOnly } from "./names";
import { PLAYER_ALIASES } from "./overrides";
import { matchPlayer, type CatalogPlayer, type PoolPlayer } from "./parse";

const pool: PoolPlayer[] = [
  { firstName: "Trae", lastName: "Young", pos: "G", nbaTeam: "Washington Wizards", season: 29 },
  { firstName: "Jahmir", lastName: "Young", pos: "G", nbaTeam: "Charlotte Hornets", season: 29 },
  { firstName: "Mikal", lastName: "Bridges", pos: "A", nbaTeam: "New York Knicks", season: 29 },
  { firstName: "Miles", lastName: "Bridges", pos: "A", nbaTeam: "Phoenix Suns", season: 29 },
  { firstName: "Andrew", lastName: "Wiggins", pos: "A", nbaTeam: "Miami Heat", season: 29 },
  { firstName: "Aaron", lastName: "Wiggins", pos: "G", nbaTeam: "Atlanta Hawks", season: 29 },
];
const freeAgent = (firstName: string, lastName: string, credits: number): CatalogPlayer => ({
  firstName,
  lastName,
  pos: "G",
  nbaTeam: "Charlotte Hornets",
  credits,
  owner: null,
});

describe("matchPlayer con snapshot Dunkest", () => {
  it("cognome unico nello snapshot: collegato, squadra NBA dallo snapshot e ruolo del foglio", () => {
    const ref = matchPlayer("Maxey", "Assago Farmers", 20, [], "A", [
      { firstName: "Tyrese", lastName: "Maxey", pos: "G", nbaTeam: "Philadelphia 76ers", season: 29 },
    ]);
    expect(ref.match).toBe("pool");
    expect(ref.catalog).toMatchObject({ firstName: "Tyrese", nbaTeam: "Philadelphia 76ers", credits: null, owner: null });
    expect(ref.pos).toBe("A");
  });

  it("omonimo free agent nel listone: non è il giocatore in rosa", () => {
    const ref = matchPlayer("Young", "Assago Farmers", 28, [freeAgent("Jahmir", "Young", 7)], "G", pool);
    expect(ref.match).toBe("pool");
    expect(ref.catalog?.firstName).toBe("Trae");
  });

  it("più candidati: decide il ruolo della riga solo se ne resta uno", () => {
    expect(matchPlayer("Wiggins", "Spaccinos", 8, [], "G", pool).catalog?.firstName).toBe("Aaron");
    expect(matchPlayer("Wiggins", "Spaccinos", 8, [], "C", pool).match).toBe("ambiguous");
  });

  it("prefisso del nome: restringe i candidati", () => {
    expect(matchPlayer("An.Wiggins", null, null, [], "A", pool).catalog?.firstName).toBe("Andrew");
  });

  it("nessun candidato: resta provvisorio", () => {
    expect(matchPlayer("Rookiez", null, 3, [], "G", pool)).toMatchObject({ match: "none", catalog: null });
  });

  it("alias: ha la precedenza e cerca prima nel listone", () => {
    const listed = { ...freeAgent("Andrew", "Wiggins", 10.5), pos: "A" as const };
    const ref = matchPlayer("An.Wiggins", null, null, [listed, freeAgent("Aaron", "Wiggins", 5)], "A", pool);
    expect(ref).toMatchObject({ match: "alias", catalog: listed });
    expect(matchPlayer("Mk.Bridges", "CUS Cosenza", 6, [], "A", pool)).toMatchObject({ match: "alias" });
  });
});

describe("PLAYER_ALIASES", () => {
  const snapshot = JSON.parse(readFileSync("scripts/data/dunkest-players.json", "utf8")) as PoolPlayer[];
  const names = new Set(snapshot.map((p) => lettersOnly(p.firstName + p.lastName)));

  it("le chiavi sono già normalizzate", () => {
    for (const k of Object.keys(PLAYER_ALIASES)) expect(lettersOnly(k), k).toBe(k);
  });

  it("ogni alias punta a un giocatore dello snapshot Dunkest", () => {
    for (const [k, full] of Object.entries(PLAYER_ALIASES)) expect(names.has(lettersOnly(full)), `${k} → ${full}`).toBe(true);
  });
});
