import { describe, expect, it } from "vitest";
import { resolveProfile } from "./profile";

describe("resolveProfile", () => {
  it("usa la riga del profilo quando esiste", () => {
    const row = { display_name: "Gabby", role: "admin" as const, team_id: "t1" };
    expect(resolveProfile("g@x.it", row, null)).toEqual({ email: "g@x.it", ...row });
  });

  it("profilo assente: fallback viewer senza squadra", () => {
    expect(resolveProfile("v@x.it", null, null)).toEqual({ email: "v@x.it", display_name: "v@x.it", role: "viewer", team_id: null });
  });

  it("errore DB: lancia invece di ripiegare su viewer", () => {
    expect(() => resolveProfile("g@x.it", null, { message: "timeout" })).toThrow(/timeout/);
  });
});
