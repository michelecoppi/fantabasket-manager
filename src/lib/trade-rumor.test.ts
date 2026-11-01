import { describe, expect, it } from "vitest";
import { RUMOR_CLOSINGS, RUMOR_HEADLINES, RUMOR_LINES, parseRumors, rumorText } from "./trade-rumor";

describe("parseRumors", () => {
  it("legge le proposte con almeno due squadre", () => {
    expect(parseRumors([{ id: 3, teams: ["Bol Bollerz", "Spaccinos"] }, { id: 4, teams: ["Solo"] }, { id: "x", teams: ["A", "B"] }, null])).toEqual([
      { id: 3, teams: ["Bol Bollerz", "Spaccinos"] },
    ]);
    expect(parseRumors(null)).toEqual([]);
  });
});

describe("rumorText", () => {
  const rumor = { id: 7, teams: ["Bol Bollerz", "Spaccinos"] };

  it("nomina le squadre e nient'altro", () => {
    const text = rumorText(rumor);
    expect(text).toContain("<b>Bol Bollerz</b>");
    expect(text).toContain("<b>Spaccinos</b>");
    expect(text).not.toContain("{teams}");
    expect(text).not.toContain("storico-scambi");
  });

  it("è sempre uguale per la stessa proposta", () => {
    expect(rumorText(rumor)).toBe(rumorText({ ...rumor }));
  });

  it("protegge l'HTML dei nomi", () => {
    expect(rumorText({ id: 1, teams: ["A<b>", "B&C"] })).toContain("<b>A&lt;b&gt;</b>");
  });

  it("con tre squadre le unisce con «e»", () => {
    expect(rumorText({ id: 2, teams: ["A", "B", "C"] })).toContain("<b>A</b>, <b>B</b> e <b>C</b>");
  });

  it("ogni frase usa solo il segnaposto previsto", () => {
    for (const line of RUMOR_LINES) expect(line.match(/\{\w+\}/g)?.every((m) => m === "{teams}") ?? true).toBe(true);
    for (const s of [...RUMOR_HEADLINES, ...RUMOR_CLOSINGS]) expect(s).not.toMatch(/[{}]/);
  });
});
