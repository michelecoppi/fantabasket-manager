import { describe, expect, it } from "vitest";
import { fmt, fmtEuro } from "./format";

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
