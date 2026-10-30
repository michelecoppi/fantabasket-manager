import { describe, expect, it } from "vitest";
import { auditChanges, parseTrade } from "./trades";

describe("parseTrade", () => {
  it("converte il formato vecchio a due squadre in movimenti", () => {
    const t = parseTrade({
      team_a: "a",
      team_b: "b",
      a_gives: { contracts: [{ id: 1, version: 2, label: "Mario Rossi" }], picks: [] },
      b_gives: { contracts: [], picks: [{ id: 9, version: 1 }] },
    });
    expect(t.complete).toBe(true);
    expect(t.teams).toEqual(["a", "b"]);
    expect(t.moves).toEqual([
      { kind: "contract", id: 1, from: "a", to: "b", label: "Mario Rossi", slot: undefined },
      { kind: "pick", id: 9, from: "b", to: "a", label: undefined, slot: undefined },
    ]);
  });
  it("legge il formato a più squadre", () => {
    const t = parseTrade({
      teams: ["a", "b", "c"],
      moves: [
        { kind: "contract", id: 1, version: 1, from: "a", to: "c", slot: "reserve", label: "X" },
        { kind: "pick", id: 2, version: 1, from: "c", to: "b" },
      ],
    });
    expect(t.complete).toBe(true);
    expect(t.moves.map((m) => `${m.from}>${m.to}`)).toEqual(["a>c", "c>b"]);
    expect(t.moves[0].slot).toBe("reserve");
  });
  it("legge lo slot di arrivo e scarta valori non ammessi", () => {
    const t = parseTrade({
      team_a: "a",
      team_b: "b",
      a_gives: { contracts: [{ id: 1, slot: "reserve" }, { id: 2, slot: "talent" }, { id: 3 }] },
    });
    expect(t.moves.map((c) => c.slot)).toEqual(["reserve", undefined, undefined]);
  });
  it("segna incompleti i payload importati o vuoti", () => {
    expect(parseTrade({}).complete).toBe(false);
    expect(parseTrade(null).complete).toBe(false);
    expect(parseTrade({ team_a: "a", team_b: "b", a_gives: {}, b_gives: {} }).complete).toBe(false);
    expect(parseTrade({ teams: ["a", "b"], moves: [] }).complete).toBe(false);
  });
  it("ignora voci malformate o con squadre fuori dallo scambio", () => {
    expect(parseTrade({ team_a: "a", team_b: "b", a_gives: { contracts: [null, { id: "x" }, { id: 3 }] } }).moves.map((m) => m.id)).toEqual([3]);
    expect(parseTrade({ teams: ["a", "b"], moves: [{ kind: "contract", id: 1, from: "a", to: "z" }, { kind: "x", id: 2, from: "a", to: "b" }] }).moves).toEqual([]);
  });
  it("legge i talenti con i dati scritti dal database (7.6); uno scambio di soli talenti è completo", () => {
    const t = parseTrade({
      teams: ["a", "b"],
      moves: [
        { kind: "talent", id: 5, version: 1, from: "a", to: "b", label: "Cooper Flagg", draft_year: 2025, entry_credits: "9.5", player_id: 77, slot: "reserve" },
        { kind: "talent", id: 6, version: 1, from: "b", to: "a", label: "Estero", draft_year: null, entry_credits: null, player_id: null },
      ],
    });
    expect(t.complete).toBe(true);
    expect(t.moves).toEqual([
      { kind: "talent", id: 5, from: "a", to: "b", label: "Cooper Flagg", slot: undefined, draftYear: 2025, credits: 9.5, playerId: 77 },
      { kind: "talent", id: 6, from: "b", to: "a", label: "Estero", slot: undefined, draftYear: undefined, credits: undefined, playerId: undefined },
    ]);
  });
});

describe("auditChanges", () => {
  it("mostra solo i campi cambiati con etichette italiane", () => {
    expect(auditChanges({ team_id: "a", salary: 5 }, { team_id: "b", salary: 5 })).toEqual([{ field: "Squadra", before: "a", after: "b" }]);
  });
  it("gestisce before nullo e booleani", () => {
    expect(auditChanges(null, { summary: "x", team_option: true })).toEqual([{ field: "Team option", before: "–", after: "sì" }]);
  });
});
