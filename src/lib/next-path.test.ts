import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("accetta percorsi interni con query", () => {
    expect(safeNextPath("/admin/firma")).toBe("/admin/firma");
    expect(safeNextPath("/giocatori?q=lebron&page=2")).toBe("/giocatori?q=lebron&page=2");
  });
  it("rifiuta URL esterni e varianti", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "javascript:alert(1)", "/\t/evil.com", "/a\nb"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
  it("evita cicli su login e auth", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/")).toBe("/");
    expect(safeNextPath("/auth/callback")).toBe("/");
  });
  it("usa / se manca o è troppo lungo", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(`/${"a".repeat(600)}`)).toBe("/");
  });
});
