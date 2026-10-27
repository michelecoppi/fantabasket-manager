import { describe, expect, it } from "vitest";
import { fmt, fmtDateTime, fmtDay, fmtEuro } from "./format";

describe("formattazione degli importi", () => {
  it("mantiene i crediti a un decimale", () => {
    expect(fmt(8)).toBe("8");
    expect(fmt(3.5)).toBe("3,5");
  });

  it("mostra gli euro con due decimali senza arrotondare ai decimi", () => {
    expect(fmtEuro(2.75)).toBe("2,75");
    expect(fmtEuro(2)).toBe("2,00");
  });
});

describe("date dei dati Dunkest", () => {
  it("mostra l'ora italiana (solare e legale)", () => {
    expect(fmtDateTime("2026-10-27T08:02:00Z")).toBe("27 ott, 09:02");
    expect(fmtDateTime("2027-04-02T08:00:00Z")).toBe("2 apr, 10:00");
    expect(fmtDay("2026-10-19")).toBe("19 ott");
  });
});
