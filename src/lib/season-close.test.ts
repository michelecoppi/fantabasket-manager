import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S } from "./cap";
import { planSeasonClose, type CloseContract, type CloseInput, type ClosePick } from "./season-close";

const ids = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
const ranking = ids; // t1 primo … t8 ultimo
const lottery = ["t7", "t5", "t8", "t6"]; // uscita dalla lottery tra le ultime 4

const picks: ClosePick[] = [2027, 2028].flatMap((year) =>
  [1, 2, 3, 4, 5].flatMap((round) => ids.map((t) => ({ year, round, originalTeamId: t, currentTeamId: t, toConfirm: false }))),
);

const contract = (id: number, over: Partial<CloseContract> = {}): CloseContract => ({
  id, version: 1, teamId: "t1", name: `G${id}`, years: 1, teamOption: false, isRookie: false, restriction: null, ...over,
});

const input = (over: Partial<CloseInput> = {}): CloseInput => ({
  seasonId: 1,
  seasonYear: 2026,
  teams: ids.map((id) => ({ id, name: id.toUpperCase(), taxEur: 0, taxPaid: false })),
  contracts: [],
  cuts: [],
  picks,
  ...over,
});

const choices = { ranking, lottery, exercised: [] as number[] };

describe("chiusura stagione: classifica e bonus (R-60)", () => {
  it("assegna a ogni squadra il bonus della sua posizione", () => {
    const p = planSeasonClose(input(), choices, S);
    expect(p.errors).toEqual([]);
    expect(p.teams.map((t) => t.bonus)).toEqual([5, 4, 3, 2, 0, -1, -2, -3]);
    expect(p.teams[7]).toEqual({ teamId: "t8", rank: 8, bonus: -3, taxEur: 0 });
  });

  it("chiede una classifica completa e senza doppioni", () => {
    expect(planSeasonClose(input(), { ...choices, ranking: ["t1", "t1", "t3", "t4", "t5", "t6", "t7", "t8"] }, S).errors[0]).toMatch(/classifica/);
    expect(planSeasonClose(input(), { ...choices, ranking: ["", ...ids.slice(1)] }, S).errors[0]).toMatch(/classifica/);
  });

  it("segnala bonus e squadre in numero diverso", () => {
    const p = planSeasonClose(input(), choices, { ...S, rankBonus: [5, 4] });
    expect(p.errors.join(" ")).toMatch(/R-60/);
  });
});

describe("chiusura stagione: ordine del draft (R-32)", () => {
  it("prime 4 dalla lottery, poi le altre in ordine inverso di classifica, stesso ordine in ogni giro", () => {
    const p = planSeasonClose(input(), choices, S);
    expect(p.errors).toEqual([]);
    const round1 = p.draftOrder.filter((d) => d.round === 1);
    expect(round1.map((d) => d.teamId)).toEqual(["t7", "t5", "t8", "t6", "t4", "t3", "t2", "t1"]);
    expect(p.draftOrder).toHaveLength(40);
    expect(p.draftOrder.find((d) => d.round === 2 && d.originalTeamId === "t7")?.pickNo).toBe(9);
    expect(p.draftOrder.at(-1)?.pickNo).toBe(40);
  });

  it("la lottery deve riguardare proprio le ultime 4", () => {
    const p = planSeasonClose(input(), { ...choices, lottery: ["t1", "t5", "t8", "t6"] }, S);
    expect(p.errors.join(" ")).toMatch(/Lottery/);
    expect(p.draftOrder).toEqual([]);
  });

  it("la scelta va a chi la possiede adesso e la nota dice da chi arriva", () => {
    const traded = picks.map((x) => (x.year === 2027 && x.round === 1 && x.originalTeamId === "t8" ? { ...x, currentTeamId: "t2" } : x));
    const p = planSeasonClose(input({ picks: traded }), choices, S);
    const pick = p.draftOrder.find((d) => d.round === 1 && d.originalTeamId === "t8");
    expect(pick).toMatchObject({ pickNo: 3, teamId: "t2", note: "Da T8" });
  });

  it("blocca se mancano pick o non hanno proprietario, avvisa se da confermare", () => {
    const noOwner = picks.map((x) => (x.year === 2027 && x.round === 3 && x.originalTeamId === "t1" ? { ...x, currentTeamId: null } : x));
    expect(planSeasonClose(input({ picks: noOwner }), choices, S).errors.join(" ")).toMatch(/senza proprietario/);
    expect(planSeasonClose(input({ picks: picks.filter((x) => x.year !== 2027) }), choices, S).errors.join(" ")).toMatch(/Mancano 40 pick/);
    const toConfirm = picks.map((x) => (x.year === 2027 && x.round === 1 && x.originalTeamId === "t1" ? { ...x, toConfirm: true } : x));
    const p = planSeasonClose(input({ picks: toConfirm }), choices, S);
    expect(p.errors).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/da confermare/);
  });
});

describe("chiusura stagione: scadenza dei contratti (R-23, R-24, R-26)", () => {
  const plan = (contracts: CloseContract[], exercised: number[] = []) => planSeasonClose(input({ contracts }), { ...choices, exercised }, S);

  it("con più di un anno residuo il contratto passa alla stagione nuova con un anno in meno", () => {
    const p = plan([contract(1, { years: 3 }), contract(2, { years: 2, teamOption: true, restriction: "unrestricted" })]);
    expect(p.carryContracts).toEqual([
      { id: 1, version: 1, years: 2, teamOption: false, restriction: null },
      { id: 2, version: 1, years: 1, teamOption: true, restriction: "unrestricted" },
    ]);
    expect(p.expireContracts).toEqual([]);
  });

  it("1/2/3 stagioni senza option scadono restricted, anche i rookie (R-23, R-26)", () => {
    const p = plan([contract(1), contract(2, { isRookie: true })]);
    expect(p.expireContracts.map((c) => c.restricted)).toEqual([true, true]);
  });

  it("secondo contratto dopo un pareggio e mezza stagione scadono unrestricted (R-24, R-23)", () => {
    const p = plan([contract(1, { restriction: "unrestricted" }), contract(2, { years: 0.5 })]);
    expect(p.expireContracts.map((c) => c.restricted)).toEqual([false, false]);
  });

  it("option esercitata: un anno in più, poi unrestricted; non esercitata: scade restricted", () => {
    const options = [contract(1, { teamOption: true }), contract(2, { teamOption: true })];
    const p = plan(options, [1]);
    expect(p.carryContracts).toEqual([{ id: 1, version: 1, years: 1, teamOption: false, restriction: "unrestricted" }]);
    expect(p.expireContracts).toMatchObject([{ id: 2, restricted: true }]);
  });

  it("una option esercitata su un contratto che non la prevede è un errore", () => {
    expect(plan([contract(1)], [1]).errors.join(" ")).toMatch(/team option/);
    expect(plan([contract(1, { years: 2, teamOption: true })], [1]).errors.join(" ")).toMatch(/team option/);
  });

  it("blocca se ci sono contratti senza durata", () => {
    const p = plan([contract(1, { years: null })]);
    expect(p.errors.join(" ")).toMatch(/senza durata/);
  });
});

describe("chiusura stagione: tagli e luxury tax", () => {
  it("la quota dei tagli continua finché dura il contratto", () => {
    const cuts = [
      { id: 1, version: 1, teamId: "t1", name: "A", status: "cut" as const, years: 2 },
      { id: 2, version: 1, teamId: "t1", name: "B", status: "cut" as const, years: 1 },
    ];
    const p = planSeasonClose(input({ cuts }), choices, S);
    expect(p.carryCuts).toEqual([{ id: 1, version: 1, years: 1 }]);
    expect(p.endCuts).toEqual([{ id: 2, version: 1 }]);
  });

  it("blocca se un taglio è ancora in asta", () => {
    const p = planSeasonClose(input({ cuts: [{ id: 1, version: 1, teamId: "t1", name: "A", status: "pending", years: 1 }] }), choices, S);
    expect(p.errors.join(" ")).toMatch(/asta dei tagliati/);
  });

  it("avvisa della luxury tax non pagata, senza bloccare", () => {
    const teams = ids.map((id) => ({ id, name: id.toUpperCase(), taxEur: id === "t4" ? 2.5 : 0, taxPaid: false }));
    const p = planSeasonClose(input({ teams }), choices, S);
    expect(p.errors).toEqual([]);
    expect(p.warnings.join(" ")).toContain("T4 deve 2,50 €");
  });

  it("il riepilogo c'è solo se il piano è valido", () => {
    expect(planSeasonClose(input({ contracts: [contract(1, { years: 2 })] }), choices, S).summary).toMatch(/Stagione 2026 chiusa.*Contratti: 1 passano al 2027, 0 scadono/);
    expect(planSeasonClose(input(), { ...choices, ranking: [] }, S).summary).toBe("");
  });
});
