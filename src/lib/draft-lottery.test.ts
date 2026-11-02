import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./cap";
import {
  draftRoundOrder,
  fmtChance,
  lotteryBoard,
  drawLottery,
  lotteryEntrants,
  lotteryOdds,
  pickByRoll,
  pickNumbers,
  recordEntrants,
  rollFromDigest,
  slotWithoutLottery,
  ticketRanges,
  verifyLottery,
  webSha256,
  type BoardPick,
  type LotteryRecord,
} from "./draft-lottery";

const nodeSha = async (t: string) => new Uint8Array(createHash("sha256").update(t).digest());
const ranking = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
const { entrants } = lotteryEntrants(ranking, DEFAULT_SETTINGS);
// Stesso vettore di supabase/tests/rls.sql (`lottery_draw`): se cambia la procedura, cambiano entrambi.
const SEED = "00112233445566778899aabbccddeeff";
const EXPECTED = [
  { pick: 1, teamId: "t6", roll: 8, total: 10 },
  { pick: 2, teamId: "t8", roll: 2, total: 8 },
  { pick: 3, teamId: "t5", roll: 3, total: 4 },
  { pick: 4, teamId: "t7", roll: null, total: 3 },
];

describe("lottery del draft: chi partecipa (R-32)", () => {
  it("le ultime 4 dalla peggiore, con 4/3/2/1 biglietti", () => {
    expect(entrants).toEqual([
      { teamId: "t8", rank: 8, weight: 4 },
      { teamId: "t7", rank: 7, weight: 3 },
      { teamId: "t6", rank: 6, weight: 2 },
      { teamId: "t5", rank: 5, weight: 1 },
    ]);
  });

  it("i biglietti vengono da league_settings e devono essere uno per squadra in gara", () => {
    expect(lotteryEntrants(ranking, { lotteryTeams: 3, lotteryWeights: [5, 3, 1] }).entrants.map((e) => [e.teamId, e.weight])).toEqual([["t8", 5], ["t7", 3], ["t6", 1]]);
    expect(lotteryEntrants(ranking, { lotteryTeams: 4, lotteryWeights: [4, 3] }).errors[0]).toMatch(/lottery_weight/);
    expect(lotteryEntrants(ranking, { lotteryTeams: 2, lotteryWeights: [1, 0] }).errors[0]).toMatch(/almeno un biglietto/);
    expect(lotteryEntrants(ranking, { lotteryTeams: 9, lotteryWeights: [] }).errors[0]).toMatch(/lottery_teams/);
  });

  it("la classifica deve essere completa e senza doppioni", () => {
    expect(lotteryEntrants(["t1", "t1", "t3", "t4", "t5", "t6", "t7", "t8"], DEFAULT_SETTINGS).errors).toContain("Completa la classifica: ogni squadra in una sola posizione.");
    expect(lotteryEntrants(["t1", "", "t3", "t4", "t5", "t6", "t7", "t8"], DEFAULT_SETTINGS).errors).toHaveLength(1);
  });
});

describe("lottery del draft: estrazione", () => {
  it("biglietti numerati di seguito dalla peggiore", () => {
    expect(ticketRanges(entrants)).toEqual([
      { teamId: "t8", from: 1, to: 4 },
      { teamId: "t7", from: 5, to: 7 },
      { teamId: "t6", from: 8, to: 9 },
      { teamId: "t5", from: 10, to: 10 },
    ]);
    expect(pickByRoll(entrants, 0).teamId).toBe("t8");
    expect(pickByRoll(entrants, 3).teamId).toBe("t8");
    expect(pickByRoll(entrants, 4).teamId).toBe("t7");
    expect(pickByRoll(entrants, 9).teamId).toBe("t5");
    expect(() => pickByRoll(entrants, 10)).toThrow();
  });

  it("il numero estratto sono i primi 4 byte del digest, senza segno, modulo i biglietti", () => {
    expect(rollFromDigest(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 10)).toBe(4294967295 % 10);
    expect(rollFromDigest(new Uint8Array([0x92, 0x22, 0x40, 0x7c]), 10)).toBe(8);
  });

  it("dal seme: una scelta per estrazione, chi esce non rientra, l'ultima rimasta prende l'ultima scelta", async () => {
    const draws = await drawLottery(SEED, entrants, nodeSha);
    expect(draws).toEqual(EXPECTED);
    // Dopo ogni estrazione restano in gara le altre con gli stessi biglietti: 10, poi 10 − 2 (t6), poi 8 − 4 (t8), poi t7 da sola.
    expect(draws.map((d) => d.total)).toEqual([10, 8, 4, 3]);
  });

  it("Web Crypto e node:crypto danno lo stesso sorteggio", async () => {
    expect(await drawLottery(SEED, entrants, webSha256)).toEqual(EXPECTED);
  });

  it("anche la squadra con un solo biglietto può vincere", async () => {
    const draws = await drawLottery("6f1c2d3e4b5a69788796a5b4c3d2e1f0", entrants, nodeSha);
    expect(draws.map((d) => d.teamId)).toEqual(["t5", "t8", "t6", "t7"]);
  });

  it("la verifica riconosce un sorteggio rifatto dal seme e scarta uno ritoccato", async () => {
    const record: LotteryRecord = {
      seasonId: 1,
      draftYear: 2027,
      ranking,
      entrants: entrants.map((e) => e.teamId),
      weights: entrants.map((e) => e.weight),
      seed: SEED,
      draws: EXPECTED,
      drawnAt: "2027-04-14T19:03:00Z",
      drawnBy: "Gabby",
    };
    expect(recordEntrants(record)).toEqual(entrants);
    expect(await verifyLottery(record, nodeSha)).toBe(true);
    const swapped = [{ ...EXPECTED[0], teamId: "t8" }, { ...EXPECTED[1], teamId: "t6" }, EXPECTED[2], EXPECTED[3]];
    expect(await verifyLottery({ ...record, draws: swapped }, nodeSha)).toBe(false);
    expect(await verifyLottery({ ...record, weights: [1, 2, 3, 4] }, nodeSha)).toBe(false);
  });
});

describe("lottery del draft: probabilità", () => {
  const odds = lotteryOdds(entrants);
  const pct = (x: number) => Math.round(x * 1000) / 10;

  it("la 1ª scelta va in proporzione ai biglietti", () => {
    expect(odds.map((o) => pct(o[0]))).toEqual([40, 30, 20, 10]);
  });

  it("ogni squadra prende una scelta e ogni scelta va a una squadra", () => {
    for (const row of odds) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    for (let k = 0; k < 4; k++) expect(odds.reduce((a, row) => a + row[k], 0)).toBeCloseTo(1, 10);
  });

  it("calcolo a mano: l'ultima della classifica prende la 2ª con il 30,8%", () => {
    // 0,3·4/7 + 0,2·4/8 + 0,1·4/9
    expect(odds[0][1]).toBeCloseTo(0.3 * (4 / 7) + 0.2 * (4 / 8) + 0.1 * (4 / 9), 12);
    expect(pct(odds[3][3])).toBeGreaterThan(pct(odds[0][3]));
  });
});

describe("tabellone del sorteggio", () => {
  const record: LotteryRecord = {
    seasonId: 1,
    draftYear: 2027,
    ranking,
    entrants: ["t8", "t7", "t6", "t5"],
    weights: [4, 3, 2, 1],
    seed: SEED,
    draws: [...EXPECTED].reverse(), // l'ordine salvato non conta: vale `pick`
    drawnAt: "2027-04-14T19:03:00Z",
    drawnBy: "Gabby",
  };
  const picks: BoardPick[] = [1, 2, 3, 4, 5].flatMap((round) => ranking.map((t) => ({ year: 2027, round, originalTeamId: t, currentTeamId: t })));
  const traded = picks.map((p) => (p.originalTeamId === "t8" && p.round === 2 ? { ...p, currentTeamId: "t1" } : p));
  const board = lotteryBoard(record, traded, 5);

  it("ordine, numeri di ogni giro e posti guadagnati o persi", () => {
    expect(board.slots.map((s) => s.teamId)).toEqual(["t6", "t8", "t5", "t7", "t4", "t3", "t2", "t1"]);
    expect(board.slots[0]).toMatchObject({ pick: 1, rank: 6, lottery: true, weight: 2, move: 2, numbers: [1, 9, 17, 25, 33] });
    expect(board.slots[1].move).toBe(-1); // l'ultima della classifica sarebbe stata 1ª
    expect(board.slots[7]).toMatchObject({ pick: 8, teamId: "t1", lottery: false, weight: null, chance: null, move: 0, draw: null });
  });

  it("biglietti di ogni squadra nell'estrazione che le ha dato la scelta", () => {
    // 1ª estrazione su 10: t6 ha l'8 e il 9, è uscito il 9 (roll 8). 2ª su 8 (t8 1-4, t7 5-7, t5 8): uscito il 3.
    expect(board.slots[0].draw).toEqual({ step: 1, roll: 8, total: 10, from: 8, to: 9 });
    expect(board.slots[1].draw).toEqual({ step: 2, roll: 2, total: 8, from: 1, to: 4 });
    expect(board.slots[2].draw).toEqual({ step: 3, roll: 3, total: 4, from: 4, to: 4 });
    expect(board.slots[3].draw).toEqual({ step: 4, roll: null, total: 3, from: 1, to: 3 });
  });

  it("probabilità della scelta avuta e della 1ª, pick scambiate", () => {
    expect(board.slots[0].chance).toBeCloseTo(0.2, 10);
    expect(board.entrants.map((e) => fmtChance(e.chanceFirst))).toEqual(["40%", "30%", "20%", "10%"]);
    expect(board.slots[1].traded).toEqual([{ round: 2, number: 10, ownerId: "t1" }]);
  });

  it("probabilità in percentuale", () => {
    expect(fmtChance(0.4)).toBe("40%");
    expect(fmtChance(0.0667)).toBe("6,7%");
    expect(fmtChance(0.05)).toBe("5%");
    expect(fmtChance(0.123)).toBe("12%");
  });
});

describe("ordine del draft (R-31, R-32)", () => {
  it("prima la lottery, poi le altre in ordine inverso di classifica", () => {
    expect(draftRoundOrder(ranking, ["t6", "t8", "t5", "t7"])).toEqual(["t6", "t8", "t5", "t7", "t4", "t3", "t2", "t1"]);
  });

  it("stesso posto in ogni giro: la 1ª sceglie 1, 9, 17, 25, 33", () => {
    expect(pickNumbers(1, 8, 5)).toEqual([1, 9, 17, 25, 33]);
    expect(pickNumbers(8, 8, 5)).toEqual([8, 16, 24, 32, 40]);
  });

  it("senza lottery l'ultima sceglierebbe per prima", () => {
    expect(slotWithoutLottery(8, 8)).toBe(1);
    expect(slotWithoutLottery(1, 8)).toBe(8);
  });
});
