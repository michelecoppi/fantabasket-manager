import { describe, expect, it } from "vitest";
import { auditChanges, parseTrade } from "./trades";

describe("parseTrade", () => {
  it("legge un payload completo", () => {
    const t = parseTrade({
      team_a: "a",
      team_b: "b",
      a_gives: { contracts: [{ id: 1, version: 2, label: "Mario Rossi" }], picks: [] },
      b_gives: { contracts: [], picks: [{ id: 9, version: 1 }] },
    });
    expect(t.complete).toBe(true);
    expect(t.aGives.contracts).toEqual([{ id: 1, label: "Mario Rossi" }]);
    expect(t.bGives.picks).toEqual([{ id: 9, label: undefined }]);
  });
  it("legge lo slot di arrivo e scarta valori non ammessi", () => {
    const t = parseTrade({
      team_a: "a",
      team_b: "b",
      a_gives: { contracts: [{ id: 1, slot: "reserve" }, { id: 2, slot: "talent" }, { id: 3 }] },
    });
    expect(t.aGives.contracts.map((c) => c.slot)).toEqual(["reserve", undefined, undefined]);
  });
  it("segna incompleti i payload importati o vuoti", () => {
    expect(parseTrade({}).complete).toBe(false);
    expect(parseTrade(null).complete).toBe(false);
    expect(parseTrade({ team_a: "a", team_b: "b", a_gives: {}, b_gives: {} }).complete).toBe(false);
  });
  it("ignora voci malformate", () => {
    expect(parseTrade({ team_a: "a", team_b: "b", a_gives: { contracts: [null, { id: "x" }, { id: 3 }] } }).aGives.contracts).toEqual([{ id: 3, label: undefined }]);
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
