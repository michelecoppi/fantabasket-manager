import { describe, expect, it } from "vitest";
import {
  PROPOSED_RULES as R,
  addSigning,
  advance,
  auctionBase,
  bidErrors,
  bidLimit,
  closeNow,
  declineRight,
  landingSlot,
  matchRight,
  minimumBid,
  nextCaller,
  openLot,
  openingErrors,
  parseAmount,
  pauseLot,
  placeBid,
  resumeLot,
  secondsLeft,
  undoLastBid,
  type Lot,
  type LotKind,
} from "./auction";
import { DEFAULT_SETTINGS as S, type Position, type TradeSide } from "./cap";

const player = { id: 7, name: "Mario Rossi", pos: "G" as const, nbaTeam: "BOS", credits: 9, pdk: 21.5 };
const open = (kind: LotKind = "free", calledBy: string | null = "a", former: string | null = null, base = 4.5): Lot =>
  openLot({ player, kind, formerTeamId: former, base, calledBy, openingAmount: calledBy ? base : null }, 0, R);

/** Rosa con `n` titolari per ruolo e stipendio `salary` ciascuno. */
function side(starters: Partial<Record<Position, number>>, salary: number, reserves: Partial<Record<Position, number>> = {}, reserveSalary = 5): TradeSide {
  let id = 0;
  const roster: TradeSide["roster"] = [];
  for (const [pos, n] of Object.entries(starters)) for (let i = 0; i < (n ?? 0); i++) roster.push({ id: ++id, position: pos as Position, slot: "starter", salary });
  for (const [pos, n] of Object.entries(reserves)) for (let i = 0; i < (n ?? 0); i++) roster.push({ id: ++id, position: pos as Position, slot: "reserve", salary: reserveSalary });
  return { roster, cuts: [], bonus: 0 };
}

describe("base d'asta", () => {
  it("è metà dei crediti Dunkest, per eccesso al mezzo credito", () => {
    expect(auctionBase(9, null, R)).toBe(4.5);
    expect(auctionBase(7.5, null, R)).toBe(4); // 3,75 → 4
    expect(auctionBase(12, null, R)).toBe(6);
  });
  it("almeno un passo", () => {
    expect(auctionBase(0.5, null, R)).toBe(0.5);
    expect(auctionBase(0, null, R)).toBe(0.5);
  });
  it("R-25: un ex-contratto non parte sotto il suo minimo", () => {
    expect(auctionBase(4, { lastSalary: 15, minimum: 7.5, expiresOn: "2027-08-01" }, R)).toBe(7.5);
    expect(auctionBase(4, { lastSalary: 5.5, minimum: 2.8, expiresOn: "2027-08-01" }, R)).toBe(3); // 2,8 → 3
    expect(auctionBase(20, { lastSalary: 5, minimum: 2.5, expiresOn: "2027-08-01" }, R)).toBe(10);
  });
});

describe("offerte", () => {
  it("chi chiama apre alla base e il cronometro parte da openSeconds", () => {
    const lot = open();
    expect(lot.bids).toEqual([{ teamId: "a", amount: 4.5, at: 0 }]);
    expect(secondsLeft(lot, 0)).toBe(R.openSeconds);
    expect(minimumBid(lot, R)).toBe(5);
  });
  it("R-51: il pareggio non vince, serve almeno un passo in più", () => {
    const lot = open();
    expect(bidErrors(lot, "b", 4.5, 1000, 100, R)[0]).toMatch(/pareggio non vince/);
    expect(bidErrors(lot, "b", 4.8, 1000, 100, R)).toHaveLength(1);
    expect(bidErrors(lot, "b", 5, 1000, 100, R)).toEqual([]);
    expect(bidErrors(lot, "b", 7.5, 1000, 100, R)).toEqual([]); // si può saltare
    expect(bidErrors(lot, "b", 7.3, 1000, 100, R)[0]).toMatch(/di 0.5 in 0.5/);
  });
  it("cifra scritta a mano: virgola o punto, al massimo un decimale", () => {
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount(" 13 ")).toBe(13);
    expect(parseAmount("7.5")).toBe(7.5);
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount("-3")).toBeNaN();
    expect(parseAmount("4,25")).toBeNaN();
    expect(parseAmount("dieci")).toBeNaN();
  });
  it("chi chiama apre alla base o più su, sul passo, entro il suo limite", () => {
    expect(openingErrors(4.5, 4.5, 20, R)).toEqual([]);
    expect(openingErrors(4.5, 9, 20, R)).toEqual([]);
    expect(openingErrors(4.5, 4, 20, R)[0]).toMatch(/base d'asta è 4,5/);
    expect(openingErrors(4.5, 6.2, 20, R)[0]).toMatch(/di 0,5 in 0,5/);
    expect(openingErrors(4.5, 21, 20, R)[0]).toMatch(/al massimo 20/);
    expect(openingErrors(4.5, NaN, 20, R)).toHaveLength(1);
  });
  it("non si rilancia su sé stessi, né oltre il proprio limite, né a tempo scaduto", () => {
    const lot = open();
    expect(bidErrors(lot, "a", 5, 1000, 100, R)).toEqual(["Sei già in testa."]);
    expect(bidErrors(lot, "b", 6, 1000, 5.5, R)[0]).toMatch(/al massimo 5.5/);
    expect(bidErrors(lot, "b", 5, R.openSeconds * 1000, 100, R)).toEqual(["Tempo scaduto."]);
  });
  it("un rilancio riporta il cronometro a bidSeconds, ma non lo accorcia", () => {
    const early = placeBid(open(), "b", 5, 2000, 100, R).lot;
    expect(early.deadline).toBe(R.openSeconds * 1000); // restavano 13″: restano
    const late = placeBid(open(), "b", 5, 12_000, 100, R).lot;
    expect(late.deadline).toBe(12_000 + R.bidSeconds * 1000);
    expect(minimumBid(late, R)).toBe(5.5);
  });
  it("un'offerta sbagliata non cambia il lotto", () => {
    const lot = open();
    const { lot: same, errors } = placeBid(lot, "b", 4, 1000, 100, R);
    expect(same).toBe(lot);
    expect(errors).toHaveLength(1);
  });
});

describe("fine del lotto", () => {
  it("allo scadere vince chi è in testa; senza offerte resta invenduto", () => {
    const lot = placeBid(open(), "b", 6, 1000, 100, R).lot;
    expect(advance(lot, lot.deadline - 1, R)).toBe(lot);
    expect(advance(lot, lot.deadline, R).result).toEqual({ teamId: "b", amount: 6, matched: false });
    const empty = open("free", null);
    expect(advance(empty, empty.deadline, R).phase).toBe("unsold");
  });
  it("R-41: all'asta dei tagliati l'ex proprietario non offre", () => {
    const lot = open("cut", null, "x");
    expect(lot.bids).toEqual([]);
    expect(bidErrors(lot, "x", 4.5, 0, 100, R)[0]).toMatch(/R-41/);
    expect(bidErrors(lot, "b", 4.5, 0, 100, R)).toEqual([]);
  });
  it("R-23: chi ha il diritto non rilancia, poi pareggia senza replica", () => {
    let lot = open("restricted", "a", "h");
    expect(bidErrors(lot, "h", 5, 0, 100, R)[0]).toMatch(/R-23/);
    lot = placeBid(lot, "b", 8, 1000, 100, R).lot;
    lot = advance(lot, lot.deadline, R, 50);
    expect(lot.phase).toBe("match");
    expect(secondsLeft(lot, R.openSeconds * 1000)).toBe(R.matchSeconds);
    expect(matchRight(lot, "b")).toBe(lot); // solo chi ha il diritto
    expect(matchRight(lot, "h").result).toEqual({ teamId: "h", amount: 8, matched: true });
    expect(declineRight(lot, "h").result).toEqual({ teamId: "b", amount: 8, matched: false });
    expect(advance(lot, lot.deadline, R, 50).result?.teamId).toBe("b"); // tempo scaduto: vince chi era in testa
  });
  it("R-23: senza spazio per pareggiare il diritto salta", () => {
    const lot = placeBid(open("restricted", "a", "h"), "b", 8, 1000, 100, R).lot;
    expect(advance(lot, lot.deadline, R, 7.5).phase).toBe("sold");
  });
  it("R-23 (proposta): chi ha il diritto chiama il suo restricted, nessuno offre, lo tiene alla base", () => {
    const lot = open("restricted", "h", "h");
    expect(lot.bids).toEqual([]);
    const m = advance(lot, lot.deadline, R, 50);
    expect(m.phase).toBe("match");
    expect(matchRight(m, "h").result).toEqual({ teamId: "h", amount: 4.5, matched: true });
  });
});

describe("comandi dell'admin", () => {
  it("pausa e ripresa conservano il tempo (almeno 3″)", () => {
    const lot = pauseLot(open(), 10_000);
    expect(secondsLeft(lot, 99_000)).toBe(5);
    expect(bidErrors(lot, "b", 5, 10_500, 100, R)).toEqual(["Asta in pausa."]);
    expect(advance(lot, 99_000, R)).toBe(lot);
    expect(resumeLot(lot, 50_000).deadline).toBe(55_000);
    expect(resumeLot(pauseLot(open(), 14_000), 50_000).deadline).toBe(53_000);
  });
  it("annulla l'ultima offerta e ridà il tempo di un rilancio", () => {
    const lot = placeBid(open(), "b", 6, 1000, 100, R).lot;
    const undone = undoLastBid(lot, 13_000, R);
    expect(undone.bids.map((b) => b.teamId)).toEqual(["a"]);
    expect(undone.deadline).toBe(13_000 + R.bidSeconds * 1000);
  });
  it("aggiudica subito", () => {
    const lot = placeBid(open(), "b", 6, 1000, 100, R).lot;
    expect(closeNow(lot, 2000, R).result?.teamId).toBe("b");
  });
});

describe("limiti di spesa", () => {
  it("titolare: spazio salariale più la zona della luxury tax (R-12); riserva: budget riserve", () => {
    const t = side({ G: 4, A: 5, C: 3 }, 20, { G: 1 }, 10); // monte 240, riserve 10
    const lim = bidLimit(t, "G", S, R);
    expect(lim.capSpace).toBe(10);
    expect(lim.starter).toBe(30); // 10 + 20 tassabili
    expect(lim.reserve).toBe(70);
    expect(lim.max).toBe(70);
  });
  it("ruolo pieno da titolare: resta la riserva (R-01..R-03)", () => {
    const t = side({ G: 5, A: 5, C: 3 }, 18, { G: 3 }, 5);
    expect(bidLimit(t, "A", S, R)).toMatchObject({ starter: null, reserve: 65 });
    expect(bidLimit(t, "G", S, R)).toMatchObject({ starter: null, reserve: null, max: 0 });
  });
  it("il limite va per difetto al passo", () => {
    const t: TradeSide = { roster: [{ id: 1, position: "G", slot: "starter", salary: 237.7 }], cuts: [], bonus: 0 };
    expect(bidLimit(t, "C", S, R).starter).toBe(32); // 12,3 + 20 → 32
  });
  it("slot d'arrivo: titolare nel cap, poi riserva, poi titolare in luxury tax", () => {
    const t = side({ G: 4, A: 5, C: 3 }, 20, {}, 0); // spazio 10, riserve 80
    expect(landingSlot(t, "G", 10, S, R)).toBe("starter");
    expect(landingSlot(t, "G", 25, S, R)).toBe("reserve");
    const full = side({ G: 4, A: 5, C: 3 }, 20, { G: 3 }, 26); // riserve G piene
    expect(landingSlot(full, "G", 25, S, R)).toBe("starter");
    expect(landingSlot(full, "G", 31, S, R)).toBeNull();
  });
  it("l'acquisto entra nella rosa", () => {
    const t = addSigning(side({ G: 1 }, 10), { position: "C", slot: "starter", salary: 7 }, -1);
    expect(t.roster.at(-1)).toEqual({ id: -1, position: "C", slot: "starter", salary: 7 });
  });
});

describe("turni di chiamata", () => {
  const order = ["a", "b", "c", "d"];
  it("a giro, saltando chi non può chiamare", () => {
    expect(nextCaller(order, null, () => true)).toBe("a");
    expect(nextCaller(order, "b", () => true)).toBe("c");
    expect(nextCaller(order, "d", () => true)).toBe("a");
    expect(nextCaller(order, "b", (t) => t !== "c")).toBe("d");
    expect(nextCaller(order, "b", () => false)).toBeNull();
  });
});
