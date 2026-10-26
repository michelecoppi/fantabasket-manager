import { describe, expect, it } from "vitest";
import { monogram, TEAM_COLORS, teamColors } from "./team-colors";

describe("teamColors", () => {
  it("dà a ogni squadra un colore diverso, indipendente dall'ordine in cui arrivano", () => {
    const ids = ["h", "c", "a", "f", "b", "e", "g", "d"];
    const one = teamColors(ids);
    const two = teamColors([...ids].reverse());
    expect(new Set(one.values()).size).toBe(8);
    for (const id of ids) expect(one.get(id)).toBe(two.get(id));
  });

  it("ricomincia la palette oltre le 8 squadre", () => {
    const colors = teamColors(Array.from({ length: 9 }, (_, i) => `t${i}`));
    expect(colors.get("t8")).toBe(TEAM_COLORS[0]);
  });
});

describe("monogram", () => {
  it("usa le iniziali delle prime due parole o le prime due lettere", () => {
    expect(monogram("Bol Bollerz")).toBe("BB");
    expect(monogram("  los   angeles lakers ")).toBe("LA");
    expect(monogram("Lakers")).toBe("LA");
    expect(monogram("")).toBe("?");
  });
});
