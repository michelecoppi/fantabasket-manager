import { describe, expect, it } from "vitest";
import { teamValue, valueBoard, valueContracts, type ValueContract } from "./value";

const c = (playerId: number, salary: number, teamId = "a", name = `G${playerId}`): ValueContract => ({ playerId, name, pos: "G", nbaTeam: null, teamId, slot: "starter", salary });

describe("valueBoard (6.2)", () => {
  // stipendi 40, 20, 10, 1, 1; PDK 30, 45, 20, 50, 5
  const contracts = [c(1, 40, "a"), c(2, 20, "b"), c(3, 10, "a"), c(4, 1, "b"), c(5, 1, "a")];
  const stats = new Map([
    [1, { pdk: 30, gp: 5 }],
    [2, { pdk: 45, gp: 5 }],
    [3, { pdk: 20, gp: 4 }],
    [4, { pdk: 50, gp: 3 }],
    [5, { pdk: 5, gp: 6 }],
  ]);
  const board = valueBoard(contracts, stats);

  it("posizioni per stipendio e per PDK, condivise a pari valore", () => {
    const r = new Map(board.rows.map((x) => [x.playerId, [x.salaryRank, x.pdkRank, x.delta]]));
    expect(r.get(1)).toEqual([1, 3, -2]);
    expect(r.get(2)).toEqual([2, 2, 0]);
    expect(r.get(3)).toEqual([3, 4, -1]);
    expect(r.get(4)).toEqual([4, 1, 3]);
    expect(r.get(5)).toEqual([4, 5, -1]);
  });

  it("affari dal delta più alto, flop dal più basso; delta 0 in nessuna lista", () => {
    expect(board.deals.map((x) => x.playerId)).toEqual([4]);
    // a pari delta (−1) prima lo stipendio più alto
    expect(board.flops.map((x) => x.playerId)).toEqual([1, 3, 5]);
    expect(board.pool).toBe(5);
  });

  it("sotto le partite minime o senza statistiche non entra", () => {
    const b = valueBoard([c(1, 40), c(2, 20), c(9, 5)], new Map([[1, { pdk: 30, gp: 2 }], [2, { pdk: 45, gp: 3 }]]));
    expect(b.rows.map((x) => x.playerId)).toEqual([2]);
    expect(valueBoard([c(1, 40)], new Map([[1, { pdk: 30, gp: 2 }]]), { minGames: 1 }).pool).toBe(1);
  });

  it("tetto alle righe e migliore/peggiore per squadra", () => {
    expect(valueBoard(contracts, stats, { size: 2 }).flops).toHaveLength(2);
    expect(teamValue(board, "a")).toMatchObject({ deal: null, flop: { playerId: 1 } });
    expect(teamValue(board, "b")).toMatchObject({ deal: { playerId: 4 }, flop: null });
  });

  it("contratti da titolari e riserve della vista di lega", () => {
    const row = { playerId: 1, name: "X", pos: null, nbaTeam: null, slot: "reserve" as const, salary: 3 };
    expect(valueContracts([{ team: { id: "t" }, starters: [], reserves: [row] }])).toEqual([{ ...row, teamId: "t" }]);
  });
});
