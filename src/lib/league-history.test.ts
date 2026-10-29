import { describe, expect, it } from "vitest";
import { buildHistory, closedSeasonRows, sameName, seasonLabel, shortSeasonLabel, winPct, type PastRow } from "./league-history";

const row = (seasonYear: number, position: number, teamName: string, teamId: string | null, wins: number, losses: number, formerKey: string | null = null, replacedBy: string | null = null): PastRow => ({
  seasonYear,
  position,
  teamName,
  teamId,
  formerKey,
  replacedBy,
  wins,
  draws: 0,
  losses,
  totalPts: 1000 - position,
});

// Tre squadre di oggi (bol, okc, new) e due uscite: prolet (sostituita da new) e quella di Valentino, che ha cambiato nome.
const teams = [
  { id: "bol", name: "Bol Bollerz" },
  { id: "okc", name: "OKCC" },
  { id: "new", name: "CUS Cosenza" },
];
const past = [
  row(2022, 1, "San Diego Prolet", null, 40, 24, "prolet", "new"),
  row(2022, 4, "Las Vegas Sinners", null, 33, 31, "valentino"),
  row(2023, 4, "LECLERC SCARSO", null, 15, 47, "valentino"),
  row(2022, 2, "Oklahoma C.C. Thunder", "okc", 36, 28),
  row(2022, 3, "Bol Bollerz", "bol", 35, 29),
  row(2023, 2, "San Diego Prolet", null, 39, 25, "prolet", "new"),
  row(2023, 1, "Bol Bollerz", "bol", 42, 20),
  row(2023, 3, "OKCC", "okc", 31, 31),
];

describe("buildHistory", () => {
  const h = buildHistory(past, teams, 2026, [{ teamId: "bol", position: 2, wins: 2, draws: 1, losses: 1 }]);

  it("ordina le stagioni dalla più recente e trova il campione (R-61: il 1° in classifica)", () => {
    expect(h.seasons.map((s) => s.year)).toEqual([2023, 2022]);
    expect(h.seasons[0].rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(h.seasons[0].champion?.teamId).toBe("bol");
    expect(h.seasons[1].champion?.teamName).toBe("San Diego Prolet");
  });

  it("somma record, stagioni e anelli della squadra di oggi, compresa la stagione in corso", () => {
    const bol = h.careers.find((c) => c.teamId === "bol")!;
    expect(bol).toMatchObject({ since: 2022, seasons: 3, rings: [2023], podiums: 2, wins: 35 + 42 + 2, draws: 1, losses: 29 + 20 + 1 });
    expect(bol.best).toEqual({ position: 1, years: [2023] });
    expect(bol.finishes.map((f) => f.year)).toEqual([2023, 2022]);
    expect(bol.live?.position).toBe(2);
  });

  it("segna il nome che la squadra aveva in quella stagione", () => {
    const okc = h.careers.find((c) => c.teamId === "okc")!;
    expect(okc.finishes.map((f) => f.alias)).toEqual([null, "Oklahoma C.C. Thunder"]);
    expect(okc.best).toEqual({ position: 2, years: [2022] });
    expect(okc.rings).toEqual([]);
  });

  it("una squadra appena entrata ha solo la stagione in corso", () => {
    const fresh = h.careers.find((c) => c.teamId === "new")!;
    expect(fresh).toMatchObject({ since: 2026, seasons: 1, best: null, rings: [], wins: 0, live: null });
  });

  it("chi ha preso il posto di una squadra uscita non ne eredita la storia, ma la successione si vede", () => {
    expect(h.formers[0]).toEqual({ key: "prolet", name: "San Diego Prolet", aliases: [], replacedBy: "new", years: [2022, 2023], best: 1, rings: [2022], wins: 79, draws: 0, losses: 49 });
    const fresh = h.careers.find((c) => c.teamId === "new")!;
    expect(fresh.rings).toEqual([]);
    expect(fresh.replaced).toEqual([{ name: "San Diego Prolet", lastYear: 2023 }]);
  });

  it("tiene insieme i nomi della stessa squadra uscita", () => {
    expect(h.formers[1]).toMatchObject({ key: "valentino", name: "LECLERC SCARSO", aliases: ["Las Vegas Sinners"], years: [2022, 2023], best: 4, wins: 48, losses: 78 });
  });

  it("ordina le carriere per anelli, poi per percentuale di vittorie", () => {
    expect(h.careers.map((c) => c.teamId)).toEqual(["bol", "okc", "new"]);
  });

  it("ignora righe della stagione in corso o future nello storico", () => {
    const h2 = buildHistory([...past, row(2026, 1, "Bol Bollerz", "bol", 3, 0)], teams, 2026, []);
    expect(h2.seasons.map((s) => s.year)).toEqual([2023, 2022]);
    expect(h2.careers.find((c) => c.teamId === "bol")!.rings).toEqual([2023]);
  });
});

describe("etichette e percentuale", () => {
  it("scrive la stagione a cavallo di due anni", () => {
    expect(seasonLabel(2022)).toBe("2022/23");
    expect(seasonLabel(2099)).toBe("2099/00");
    expect(shortSeasonLabel(2025)).toBe("25/26");
  });

  it("non considera un cambio di nome le sole maiuscole", () => {
    expect(sameName("Cus Cosenza", "CUS Cosenza")).toBe(true);
    expect(sameName("Oklahoma C.C. Thunder", "OKCC")).toBe(false);
  });

  it("conta il pareggio come mezza vittoria", () => {
    expect(winPct({ wins: 1, draws: 2, losses: 1 })).toBe(0.5);
    expect(winPct({ wins: 0, draws: 0, losses: 0 })).toBeNull();
  });
});

describe("closedSeasonRows", () => {
  it("usa la posizione finale registrata alla chiusura e salta le stagioni già in archivio", () => {
    const rows = closedSeasonRows(
      [
        { id: 1, year: 2026 },
        { id: 0, year: 2025 },
      ],
      [
        { seasonId: 1, teamId: "bol", position: 2, totalPts: 900, wins: 40, draws: 0, losses: 24 },
        { seasonId: 1, teamId: "okc", position: 1, totalPts: 950, wins: 41, draws: 0, losses: 23 },
        { seasonId: 0, teamId: "okc", position: 1, totalPts: 950, wins: 41, draws: 0, losses: 23 },
      ],
      [{ seasonId: 1, teamId: "bol", finalRank: 1 }],
      new Map([["bol", "Bol Bollerz"]]),
      new Set([2025]),
    );
    expect(rows).toEqual([
      { seasonYear: 2026, position: 1, teamName: "Bol Bollerz", teamId: "bol", formerKey: null, replacedBy: null, wins: 40, draws: 0, losses: 24, totalPts: 900 },
      { seasonYear: 2026, position: 1, teamName: "?", teamId: "okc", formerKey: null, replacedBy: null, wins: 41, draws: 0, losses: 23, totalPts: 950 },
    ]);
  });
});
