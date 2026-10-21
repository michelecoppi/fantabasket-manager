import { describe, expect, it } from "vitest";
import type { PlayerRef } from "./parse";
import { duplicateContractPlayers } from "./report";

const provisional = (rawName: string): { player: PlayerRef } => ({
  player: { rawName, catalog: null, match: "none", pos: null },
});
const listed = (firstName: string, lastName: string, nbaTeam: string): { player: PlayerRef } => ({
  player: {
    rawName: `${firstName} ${lastName}`,
    catalog: { firstName, lastName, pos: "G", nbaTeam, credits: 10, owner: null },
    match: "owner",
    pos: "G",
  },
});

describe("duplicateContractPlayers", () => {
  it("nessun duplicato con giocatori diversi", () => {
    expect(duplicateContractPlayers([provisional("Williams"), provisional("Jones"), listed("Nikola", "Jokic", "DEN")])).toEqual([]);
  });

  it("due provvisori con lo stesso cognome finirebbero sullo stesso giocatore", () => {
    expect(duplicateContractPlayers([provisional("Williams"), provisional("Jones"), provisional("Williams")])).toEqual(["Williams"]);
  });

  it("stessa chiave di import: maiuscole, punti e accenti non distinguono", () => {
    expect(duplicateContractPlayers([provisional("J.Williams"), provisional("j williams")])).toEqual(["J.Williams"]);
  });

  it("lo stesso giocatore del listone in due contratti", () => {
    expect(duplicateContractPlayers([listed("Nikola", "Jokic", "DEN"), listed("Nikola", "Jokić", "DEN")])).toEqual(["Nikola Jokic"]);
  });
});
