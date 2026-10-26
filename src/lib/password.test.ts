import { describe, expect, it } from "vitest";
import { passwordError } from "./password";

describe("passwordError", () => {
  it("accetta una password lunga abbastanza e uguale alla conferma", () => {
    expect(passwordError("Canestro24", "Canestro24")).toBeNull();
  });

  it("rifiuta una password troppo corta", () => {
    expect(passwordError("corta", "corta")).toMatch(/almeno 8/);
  });

  it("rifiuta una conferma diversa", () => {
    expect(passwordError("Canestro24", "Canestro25")).toMatch(/non coincidono/);
  });

  it("rifiuta più di 72 caratteri (limite di bcrypt)", () => {
    const long = "a".repeat(73);
    expect(passwordError(long, long)).toMatch(/72/);
  });
});
