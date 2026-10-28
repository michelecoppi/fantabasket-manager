import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S, evaluateTrade } from "./cap";
import { addTeam, draftKey, draftMoves, emptyDraft, nextTeam, removeTeam, setArrivalSlot, setDestination, togglePick, togglePlayer, toParties, type SimTeam } from "./trade-draft";

const team = (id: string, playerId: number, salary: number, pickId?: number): SimTeam => ({
  id,
  name: id.toUpperCase(),
  bonus: 0,
  cuts: [],
  players: [{ id: playerId, name: `P${playerId}`, pos: "G", slot: "starter", salary, version: 1 }],
  picks: pickId ? [{ id: pickId, year: 2027, round: 1, toConfirm: false, label: "2027 · 1° giro", version: 3 }] : [],
});
const teams = [team("a", 1, 30, 10), team("b", 2, 20), team("c", 3, 10)];

describe("bozza di scambio (R-56)", () => {
  it("propone come destinazione la squadra successiva, a giro", () => {
    expect(nextTeam(["a", "b", "c"], "a")).toBe("b");
    expect(nextTeam(["a", "b", "c"], "c")).toBe("a");
    expect(nextTeam(["a"], "a")).toBeUndefined();
  });

  it("con una sola squadra non si cede nulla", () => {
    expect(togglePlayer(emptyDraft(["a"]), "a", 1).players.size).toBe(0);
  });

  it("selezione, destinazione e slot finiscono nelle squadre di evaluateTrade", () => {
    let d = addTeam(emptyDraft(["a", "b"]), "c", S.tradeMaxTeams);
    d = togglePlayer(d, "a", 1);
    d = setDestination(d, "players", 1, "c");
    d = setArrivalSlot(d, 1, "reserve", "starter");
    d = togglePlayer(d, "c", 3);
    d = togglePick(d, "a", 10);
    expect(d.players.get(3)?.to).toBe("a");
    expect(d.picks.get(10)?.to).toBe("b");
    const ev = evaluateTrade(toParties(teams, d), S);
    expect(ev.errors).toEqual([]);
    expect(ev.impacts.map((i) => i.after.payroll)).toEqual([10, 20, 0]);
    expect(ev.impacts[2].after.reserveSpace).toBe(S.reserveBudget - 30);
    expect(draftMoves(teams, d).map((m) => `${m.kind}:${m.id}:${m.from}>${m.to}:${m.slot ?? "-"}:${m.version}`)).toEqual([
      "contract:1:a>c:reserve:1",
      "contract:3:c>a:-:1",
      "pick:10:a>b:-:3",
    ]);
  });

  it("non manda nulla alla squadra che cede né fuori dallo scambio", () => {
    const d = togglePlayer(emptyDraft(["a", "b", "c"]), "a", 1);
    expect(setDestination(d, "players", 1, "a")).toBe(d);
    expect(setDestination(d, "players", 1, "z")).toBe(d);
  });

  it("scegliere lo slot che il giocatore ha già equivale a non scegliere", () => {
    const d = setArrivalSlot(togglePlayer(emptyDraft(["a", "b"]), "a", 1), 1, "starter", "starter");
    expect(d.players.get(1)).toEqual({ from: "a", to: "b" });
  });

  it("togliendo una squadra spariscono le sue cessioni e ciò che riceveva cambia destinazione", () => {
    let d = emptyDraft(["a", "b", "c"]);
    d = togglePlayer(d, "a", 1);
    d = setDestination(d, "players", 1, "c");
    d = togglePlayer(d, "c", 3);
    d = removeTeam(d, "c");
    expect(d.teams).toEqual(["a", "b"]);
    expect([...d.players]).toEqual([[1, { from: "a", to: "b" }]]);
  });

  it("rispetta il massimo di squadre e non aggiunge doppioni", () => {
    const d = emptyDraft(["a", "b"]);
    expect(addTeam(d, "c", 2)).toBe(d);
    expect(addTeam(d, "a", 4)).toBe(d);
  });

  it("la firma cambia a ogni modifica", () => {
    const d = emptyDraft(["a", "b"]);
    expect(draftKey(togglePlayer(d, "a", 1))).not.toBe(draftKey(d));
  });
});
