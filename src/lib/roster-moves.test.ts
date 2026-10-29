import { describe, expect, it } from "vitest";
import { groupMoves, teamRosterMoves, type FieldedPlayer, type RosterMove } from "./roster-moves";

const p = (fantasyId: number, name: string): FieldedPlayer => ({ fantasyId, playerId: fantasyId, name, pos: "G" });

describe("cambi di rosa", () => {
  // Bol Bollerz il 2026-10-29: DeRozan, Post e Mathurin schierati solo nella giornata 1 e non più in rosa.
  const fielded = [
    { matchday: 1, players: [p(1, "Doncic"), p(2, "DeRozan"), p(3, "Post"), p(4, "Mathurin")] },
    { matchday: 2, players: [p(1, "Doncic"), p(5, "Camara")] },
    { matchday: 3, players: [p(1, "Doncic"), p(5, "Camara")] },
  ];
  const current = [{ fantasyId: 1 }, { fantasyId: 5 }];

  it("uscite ricostruite dalle formazioni: chi non è più in rosa, con l'ultima giornata in formazione", () => {
    const moves = teamRosterMoves([], fielded, current);
    expect(moves.map((m) => [m.name, m.move, m.lastFielded])).toEqual([
      ["DeRozan", "out", 1],
      ["Mathurin", "out", 1],
      ["Post", "out", 1],
    ]);
  });

  it("i cambi registrati dal job vengono prima e non si duplicano con quelli ricostruiti", () => {
    const logged: Omit<RosterMove, "lastFielded">[] = [
      { ...p(2, "DeRozan"), move: "out", seenMatchday: 4, seenAt: "2026-10-30T08:00:00Z" },
      { ...p(9, "Nuovo"), move: "in", seenMatchday: 4, seenAt: "2026-10-30T08:00:00Z" },
    ];
    const moves = teamRosterMoves(logged, fielded, current);
    expect(moves.map((m) => [m.name, m.move])).toEqual([
      ["Nuovo", "in"],
      ["DeRozan", "out"],
      ["Mathurin", "out"],
      ["Post", "out"],
    ]);
    expect(groupMoves(moves).map((g) => [g.key, g.moves.length])).toEqual([
      ["seen-2026-10-30-4", 2],
      ["fielded-1", 2],
    ]);
  });

  it("rosa di oggi non letta: niente da ricostruire", () => {
    expect(teamRosterMoves([], fielded, [])).toEqual([]);
  });

  it("un giocatore uscito dopo più giornate ha l'ultima in cui è stato schierato", () => {
    const moves = teamRosterMoves([], [...fielded, { matchday: 4, players: [p(5, "Camara")] }], [{ fantasyId: 1 }]);
    expect(moves.find((m) => m.name === "Camara")?.lastFielded).toBe(4);
  });
});
