import { describe, expect, it } from "vitest";
import { parseContractName, parseSheetDate, parseTalentName, resolveTeam, splitShortName } from "./names";

describe("parseContractName", () => {
  it("anni, team option e unrestricted", () => {
    expect(parseContractName("1+1 F.Wagner u")).toMatchObject({
      years: 1,
      teamOption: true,
      name: "F.Wagner",
      restriction: "unrestricted",
    });
  });

  it("rookie e spazi doppi", () => {
    expect(parseContractName("2  Buzelis r")).toMatchObject({ years: 2, name: "Buzelis", rookie: true, restriction: null });
  });

  it("il numero nel nome non è una sigla: 'Murphy III' resta il nome", () => {
    expect(parseContractName("2 Murphy III")).toMatchObject({ years: 2, name: "Murphy III", restriction: null });
  });

  it("tagliati: stipendio originale in coda", () => {
    expect(parseContractName("1 Kr.Murray r 6", { trailingNumber: true })).toMatchObject({
      years: 1,
      name: "Kr.Murray",
      rookie: true,
      trailingNumber: 6,
    });
  });

  it("ultimo contratto: ruolo tra parentesi e flag", () => {
    expect(parseContractName("Suggs (G) u")).toMatchObject({ name: "Suggs", position: "G", restriction: "unrestricted" });
    expect(parseContractName("T.Hendricks r  (A)")).toMatchObject({ name: "T.Hendricks", position: "A", rookie: true });
  });
});

describe("altri parser", () => {
  it("nome breve", () => {
    expect(splitShortName("Ja.Williams")).toEqual({ prefix: "ja", last: "williams" });
    expect(splitShortName("Murphy III")).toEqual({ prefix: "", last: "murphyiii" });
  });

  it("talenti: anno di draft e note", () => {
    expect(parseTalentName("Sorber 25 26?")).toEqual({ name: "Sorber", draftYear: 2025, notes: "26?" });
    expect(parseTalentName("Zikarsky25")).toEqual({ name: "Zikarsky", draftYear: 2025, notes: null });
    expect(parseTalentName("Procida")).toEqual({ name: "Procida", draftYear: null, notes: null });
  });

  it("date del foglio", () => {
    expect(parseSheetDate(2026.09)).toBe("2026-09-01");
    expect(parseSheetDate(2026.02)).toBe("2026-02-01");
  });

  it("alias squadra; ChS non è ancora noto", () => {
    expect(resolveTeam("AsF")).toBe("Assago Farmers");
    expect(resolveTeam("cckers")).toBe("OKCC");
    expect(resolveTeam("ST. ANT")).toBe("San Antonio");
    expect(resolveTeam("Thunders")).toBe("OKCC");
    expect(resolveTeam("ChS")).toBeNull();
  });
});
