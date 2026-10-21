import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS as S,
  contractDurations,
  contractTermsErrors,
  cutShare,
  pickLimitWarnings,
  pickYearAllowed,
  rosterLimitErrors,
  evaluateContractEdit,
  evaluateSigning,
  evaluateTrade,
  teamOptionAllowed,
  type PickInfo,
  type TradeParty,
  type TradeSide,
} from "./cap";

const side = (bonus: number, roster: TradeSide["roster"], cuts: TradeSide["cuts"] = []): TradeSide => ({ roster, cuts, bonus });
const starter = (id: number, salary: number, position: "G" | "A" | "C" = "G") => ({ id, position, slot: "starter" as const, salary });
const party = (name: string, s: TradeSide, picks: PickInfo[] = [], gives: { contracts?: number[]; picks?: number[] } = {}): TradeParty => ({
  name,
  side: s,
  picks,
  gives: { contracts: new Set(gives.contracts ?? []), picks: new Set(gives.picks ?? []) },
});

describe("cutShare (R-42)", () => {
  it.each([
    [5, 1.5],
    [10, 3.5],
    [3, 1],
    [30, 10],
    [1, 0.5],
  ])("taglio di %s → quota %s", (salary, share) => expect(cutShare(salary)).toBe(share));
});

describe("durate e team option (R-20, R-22)", () => {
  it("durate: ½ e gli interi fino al massimo di lega", () => {
    expect(contractDurations(S)).toEqual([0.5, 1, 2, 3]);
    expect(contractDurations({ ...S, contractMaxYears: 2 })).toEqual([0.5, 1, 2]);
  });

  it("team option solo su 1 o 2 stagioni", () => {
    expect(teamOptionAllowed(1, S)).toBe(true);
    expect(teamOptionAllowed(2, S)).toBe(true);
    expect(teamOptionAllowed(3, S)).toBe(false);
    expect(teamOptionAllowed(0.5, S)).toBe(false);
    expect(teamOptionAllowed(null, S)).toBe(false);
  });

  it("errori sui termini del contratto", () => {
    const ok = { slot: "starter" as const, years: 2, teamOption: true, salary: 12.5 };
    expect(contractTermsErrors(ok, S)).toEqual([]);
    expect(contractTermsErrors({ ...ok, years: null, teamOption: false }, S)).toEqual([]); // durata da fissare
    expect(contractTermsErrors({ ...ok, salary: 0 }, S)).toHaveLength(1);
    expect(contractTermsErrors({ ...ok, salary: 3.25 }, S)).toHaveLength(1);
    expect(contractTermsErrors({ ...ok, years: 4, teamOption: false }, S)).toHaveLength(1);
    expect(contractTermsErrors({ ...ok, years: 3 }, S)).toHaveLength(1); // 3 anni + option > 3
    expect(contractTermsErrors({ ...ok, slot: "talent" }, S)).toHaveLength(1);
  });
});

describe("evaluateSigning", () => {
  it("avvisa (senza bloccare) se la firma fa sforare il cap", () => {
    const r = evaluateSigning(side(0, [starter(1, 240)]), { position: "A", slot: "starter", years: 1, teamOption: false, salary: 15 }, S);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/supera il cap/);
    expect(r.impact.after.payroll).toBe(255);
  });

  it("una riserva pesa sul budget riserve, non sul cap", () => {
    const r = evaluateSigning(side(0, [starter(1, 240)]), { position: "A", slot: "reserve", years: 1, teamOption: false, salary: 20 }, S);
    expect(r.impact.after.payroll).toBe(240);
    expect(r.impact.after.reserveSpace).toBe(60);
  });
});

describe("evaluateTrade (R-57, R-33)", () => {
  it("scambio alla pari: nessun errore, nessuno sfora", () => {
    const a = party("A", side(0, [starter(1, 20)]), [], { contracts: [1] });
    const b = party("B", side(0, [starter(2, 20)]), [], { contracts: [2] });
    const r = evaluateTrade(a, b, S);
    expect(r.errors).toEqual([]);
    expect(r.capBreakers).toEqual([]);
    expect(r.impacts[0].after.payroll).toBe(20);
  });

  it("segnala la squadra che con lo scambio sfora il cap", () => {
    const a = party("A", side(0, [starter(1, 10)]), [], { contracts: [1] });
    const b = party("B", side(0, [starter(2, 60), starter(3, 190)]), [], { contracts: [2] });
    // A: 10 → 60 (resta sotto 250). B: 250 → 200 (scende). Nessuno sfora.
    expect(evaluateTrade(a, b, S).capBreakers).toEqual([]);

    const c = party("C", side(0, [starter(1, 200)]), [], { contracts: [] });
    const d = party("D", side(0, [starter(2, 80)]), [], { contracts: [2] });
    const r = evaluateTrade(c, d, S); // C passa da 200 a 280
    expect(r.capBreakers).toEqual(["C"]);
    expect(r.impacts[0].after.overCap).toBe(true);
  });

  it("una squadra già sforata può scambiare solo se non aumenta il monte ingaggi", () => {
    const over = side(0, [starter(1, 260)]);
    expect(evaluateTrade(party("A", over, [], { contracts: [1] }), party("B", side(30, [starter(2, 250)]), [], { contracts: [2] }), S).capBreakers).toEqual([]);
    expect(evaluateTrade(party("A", over, [], { contracts: [1] }), party("B", side(30, [starter(2, 270)]), [], { contracts: [2] }), S).capBreakers).toEqual(["A"]);
  });

  it("scambio vuoto = errore; giocatore non della squadra = errore", () => {
    expect(evaluateTrade(party("A", side(0, [])), party("B", side(0, [])), S).errors).toContain("Lo scambio è vuoto.");
    const r = evaluateTrade(party("A", side(0, [starter(1, 5)]), [], { contracts: [99] }), party("B", side(0, [])), S);
    expect(r.errors.some((e) => e.includes("non appartiene a A"))).toBe(true);
  });

  it("solo pick: non incidono sul cap, ma max 2 per giro avvisa (R-33)", () => {
    const pick = (id: number, round = 1): PickInfo => ({ id, year: 2027, round, toConfirm: false });
    const a = party("A", side(0, []), [pick(1), pick(2)], { picks: [] });
    const b = party("B", side(0, []), [pick(3)], { picks: [3] });
    const r = evaluateTrade(a, b, S);
    expect(r.errors).toEqual([]);
    expect(r.capBreakers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("A: 3 pick del 1° giro 2027"))).toBe(true);
  });

  it("avvisa se una pick ceduta è da confermare", () => {
    const a = party("A", side(0, []), [{ id: 1, year: 2026, round: 1, toConfirm: true }], { picks: [1] });
    expect(evaluateTrade(a, party("B", side(0, [])), S).warnings.some((w) => w.includes("da confermare"))).toBe(true);
  });
});

const entry = (slot: "starter" | "reserve", position: "G" | "A" | "C" | null, salary = 5) => ({ position, slot, salary });
const many = (n: number, slot: "starter" | "reserve", position: "G" | "A" | "C") => Array.from({ length: n }, () => entry(slot, position));

describe("rosterLimitErrors (R-01..R-03)", () => {
  it("blocca il 6° titolare di un ruolo e il 4° riserva dello stesso ruolo", () => {
    const g5 = many(5, "starter", "G");
    expect(rosterLimitErrors(g5, [...g5, entry("starter", "G")], S)).toEqual(["Titolari G: 6 (max 5)."]);
    const r3 = many(3, "reserve", "A");
    expect(rosterLimitErrors(r3, [...r3, entry("reserve", "A")], S)).toEqual(["Riserve A: 4 (max 3)."]);
  });

  it("blocca il 14° titolare e la 7ª riserva in totale", () => {
    const starters = [...many(5, "starter", "G"), ...many(5, "starter", "A"), ...many(3, "starter", "C")];
    expect(rosterLimitErrors(starters, [...starters, entry("starter", null)], S)).toEqual(["Titolari: 14 (max 13)."]);
    const reserves = [...many(2, "reserve", "G"), ...many(2, "reserve", "A"), ...many(2, "reserve", "C")];
    expect(rosterLimitErrors(reserves, [...reserves, entry("reserve", null)], S)).toEqual(["Riserve: 7 (max 6)."]);
  });

  it("non blocca se la rosa era già oltre il massimo e l'operazione non peggiora", () => {
    const over = many(6, "starter", "G"); // dato importato dal foglio
    expect(rosterLimitErrors(over, over, S)).toEqual([]);
    expect(rosterLimitErrors(over, [...over, entry("starter", "G")], S)).toHaveLength(1);
  });

  it("i minimi (rosa incompleta) non sono errori", () => {
    expect(rosterLimitErrors([], [entry("starter", "G")], S)).toEqual([]);
  });
});

describe("evaluateSigning con i massimi di rosa", () => {
  it("un 6° portiere titolare è un errore, non solo un avviso", () => {
    const roster = many(5, "starter", "G").map((e, i) => ({ ...e, id: i + 1 }));
    const r = evaluateSigning(side(0, roster), { position: "G", slot: "starter", years: 1, teamOption: false, salary: 5 }, S);
    expect(r.errors).toEqual(["Titolari G: 6 (max 5)."]);
  });
});

describe("evaluateContractEdit", () => {
  const roster = [...many(5, "starter", "G"), ...many(3, "reserve", "A")].map((e, i) => ({ ...e, id: i + 1 }));

  it("cambiare solo lo stipendio non è bloccato nemmeno su una rosa già piena", () => {
    const r = evaluateContractEdit(side(0, roster), 1, { position: "G", slot: "starter", years: 2, teamOption: false, salary: 9 }, S);
    expect(r.errors).toEqual([]);
    expect(r.impact.after.payroll).toBe(29);
  });

  it("spostare un titolare in riserva dove ci sono già 3 riserve dello stesso ruolo è un errore", () => {
    const r = evaluateContractEdit(side(0, [...roster, { id: 99, position: "A", slot: "starter" as const, salary: 4 }]), 99, { position: "A", slot: "reserve", years: 1, teamOption: false, salary: 4 }, S);
    expect(r.errors).toEqual(["Riserve A: 4 (max 3)."]);
  });

  it("segnala anche gli errori sui termini del contratto", () => {
    const r = evaluateContractEdit(side(0, roster), 1, { position: "G", slot: "starter", years: 4, teamOption: false, salary: 5 }, S);
    expect(r.errors).toHaveLength(1);
  });
});

describe("pick (R-33, R-34)", () => {
  it("si possono possedere solo i draft dei prossimi 3 anni", () => {
    expect([2026, 2027, 2029, 2030].map((y) => pickYearAllowed(y, 2026, S))).toEqual([false, true, true, false]);
    expect(pickYearAllowed(2027.5, 2026, S)).toBe(false);
    expect(pickYearAllowed(2028, 2026, { ...S, pickHorizonYears: 1 })).toBe(false);
  });

  it("avvisa oltre 2 pick per giro, contate per anno", () => {
    const p = (round: number, year = 2027) => ({ year, round });
    expect(pickLimitWarnings("A", [p(1), p(1), p(2)], S)).toEqual([]);
    expect(pickLimitWarnings("A", [p(1), p(1), p(1)], S)).toEqual(["A: 3 pick del 1° giro 2027 (max 2, R-33)"]);
    expect(pickLimitWarnings("A", [p(1, 2027), p(1, 2028), p(1, 2029)], S)).toEqual([]);
  });
});
