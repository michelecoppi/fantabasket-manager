import { describe, expect, it } from "vitest";
import type { PlayerListItem } from "./players";
import { talentCandidates, talentNameParts } from "./talent-match";

const mk = (id: number, name: string, over: Partial<PlayerListItem> = {}): PlayerListItem => ({
  id, name, pos: "G", nbaTeam: "TST", credits: 5, ownerTeamId: null, talentTeamId: null, cutByTeamId: null, restrictedTeamId: null, lastContract: null, ...over,
});

const listone = [
  mk(1, "Tre Johnson"),
  mk(2, "Morez Johnson"),
  mk(3, "Darius Acuff Jr."),
  mk(4, "Meleek Thomas"),
  mk(5, "Dwight Powell"),
  mk(6, "Drake Powell"),
  mk(7, "Trey Kaufman-renn"),
  mk(8, "Juan De Larrea"),
  mk(9, "Nolan Traoré"),
  mk(10, "Tyler Holmes II"),
  mk(11, "LeBron James", { ownerTeamId: "t1" }),
  mk(12, "Sion James"),
];
const names = (name: string, taken?: Set<number>) => talentCandidates(name, listone, taken).map((p) => p.id);

describe("nomi della squadra talenti (R-35)", () => {
  it("separa prefisso del nome e cognome, senza anno né suffissi", () => {
    expect(talentNameParts("T.Johnson")).toEqual({ prefix: "t", last: "johnson" });
    expect(talentNameParts("Mel. Thomas")).toEqual({ prefix: "mel", last: "thomas" });
    expect(talentNameParts("Acuff jr")).toEqual({ prefix: "", last: "acuff" });
    expect(talentNameParts("M.Johnson jr")).toEqual({ prefix: "m", last: "johnson" });
    expect(talentNameParts("Holmes II (24)")).toEqual({ prefix: "", last: "holmes" });
    expect(talentNameParts("N.Traorè")).toEqual({ prefix: "n", last: "traore" });
    expect(talentNameParts("De Larrea")).toEqual({ prefix: "", last: "delarrea" });
  });
});

describe("proposte di collegamento al listone", () => {
  it("il prefisso del nome distingue gli omonimi", () => {
    expect(names("T.Johnson")).toEqual([1]);
    expect(names("M.Johnson jr")).toEqual([2]);
    expect(names("D.Powell")).toEqual([5, 6]); // resta ambiguo: sceglie l'admin
  });

  it("suffissi, accenti, trattini e cognomi di due parole", () => {
    expect(names("Acuff jr")).toEqual([3]);
    expect(names("Holmes II")).toEqual([10]);
    expect(names("N.Traorè")).toEqual([9]);
    expect(names("Kaufman-renn")).toEqual([7]);
    expect(names("De Larrea")).toEqual([8]);
    expect(names("Mel. Thomas")).toEqual([4]);
  });

  it("esclude chi ha un contratto o è già collegato a un altro talento", () => {
    expect(names("James")).toEqual([12]);
    expect(names("T.Johnson", new Set([1]))).toEqual([]);
  });

  it("chi non è nel listone (non gioca in NBA) non ha proposte", () => {
    expect(names("Zikarsky")).toEqual([]);
  });
});
