import { describe, expect, it } from "vitest";
import { talentTeamDrift } from "./talent-drift";

describe("talenti scambiati nell'app e foglio vecchio (7.6, D3)", () => {
  const sheet = [
    { team: "Bol Bollerz", displayName: "Dybantsa" },
    { team: "OKCC", displayName: "Johnson" },
    { team: "Dame Time", displayName: "Johnson" },
    { team: "Assago Farmers", displayName: "Traoré" },
  ];

  it("database uguale al foglio: nessuna divergenza", () => {
    expect(talentTeamDrift(sheet, sheet)).toEqual([]);
    expect(talentTeamDrift(sheet, [...sheet].reverse())).toEqual([]);
  });

  it("talento scambiato: squadra del database e del foglio", () => {
    const db = sheet.map((t) => (t.displayName === "Dybantsa" ? { ...t, team: "OKCC" } : t));
    expect(talentTeamDrift(sheet, db)).toEqual([{ displayName: "Dybantsa", dbTeam: "OKCC", sheetTeam: "Bol Bollerz" }]);
  });

  it("nomi uguali in squadre diverse: diverge solo quello spostato", () => {
    const swapped = sheet.map((t) => (t.displayName === "Johnson" && t.team === "OKCC" ? { ...t, team: "Bol Bollerz" } : t));
    expect(talentTeamDrift(sheet, swapped)).toEqual([{ displayName: "Johnson", dbTeam: "Bol Bollerz", sheetTeam: "OKCC" }]);
    // i due Johnson che si scambiano di squadra non cambiano niente per l'import
    const crossed = sheet.map((t) => (t.displayName !== "Johnson" ? t : { ...t, team: t.team === "OKCC" ? "Dame Time" : "OKCC" }));
    expect(talentTeamDrift(sheet, crossed)).toEqual([]);
  });

  it("nomi con accenti o spazi diversi sono lo stesso talento; talenti da una parte sola non contano", () => {
    expect(talentTeamDrift(sheet, [{ team: "OKCC", displayName: " traore " }])).toEqual([{ displayName: " traore ", dbTeam: "OKCC", sheetTeam: "Assago Farmers" }]);
    // firmato nell'app (sparito dal database) o nuovo nel foglio
    expect(talentTeamDrift(sheet, sheet.slice(1))).toEqual([]);
    expect(talentTeamDrift(sheet.slice(1), sheet)).toEqual([]);
  });
});
