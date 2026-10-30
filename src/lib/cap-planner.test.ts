import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S, teamFinance } from "./cap";
import { BASE_SCENARIO, capPlan, perOpenSlot, planYears, type PlannerTeam } from "./cap-planner";
import type { RosterPlayer } from "./league";

let nextId = 1;
const player = (salary: number, yearsLeft: number | null, extra: Partial<RosterPlayer> = {}): RosterPlayer => {
  const id = nextId++;
  return { id, playerId: id, name: `P${id}`, pos: "G", nbaTeam: null, contractLabel: String(yearsLeft ?? "?"), yearsLeft, teamOption: false, slot: "starter", salary, restriction: null, rookie: false, ...extra };
};
const cut = (paid: number, yearsLeft: number | null, status: "pending" | "cut" = "cut") => ({
  id: nextId++, playerId: 0, name: "Tagliato", pos: null, nbaTeam: null, status, paid, yearsLeft, originalSalary: null, originalSlot: null, originalIsRookie: false, teamOption: false,
});

const long = player(40, 3);
const two = player(30, 2);
const option = player(20, 1, { teamOption: true, contractLabel: "1+1" });
const half = player(5, 0.5);
const unknown = player(12, null);
const second = player(8, 1, { restriction: "unrestricted" });
const reserve = player(10, 2, { slot: "reserve" });
const finalCut = cut(3.5, 2);
const pendingCut = cut(1.5, 1, "pending");

const team: PlannerTeam = { starters: [long, two, option, half, unknown, second], reserves: [reserve], cuts: [finalCut, pendingCut], bonus: -2 };

describe("capPlan (P3-03, scenari del cap)", () => {
  it("copre almeno la durata massima di un contratto (R-20/R-22)", () => {
    expect(planYears(team, 2026, S)).toEqual([2026, 2027, 2028]);
    expect(planYears({ ...team, starters: [player(1, 3, { teamOption: true })] }, 2026, S)).toEqual([2026, 2027, 2028, 2029]);
  });

  it("la stagione corrente riproduce teamFinance, bonus reale compreso", () => {
    const now = capPlan(team, 2026, S).seasons[0];
    const f = teamFinance(
      [...team.starters, ...team.reserves].map((p) => ({ position: p.pos, slot: p.slot, salary: p.salary })),
      team.cuts.map((c) => ({ salary: c.paid })),
      team.bonus,
      S,
    );
    expect(now.payroll).toBe(f.payroll);
    expect(now.space).toBe(f.capSpace);
    expect(now.cap).toBe(248);
    expect(now.capKind).toBe("actual");
    expect(now.capRange).toBeNull();
    expect(now.reserveSpace).toBe(f.reserveSpace);
  });

  it("nelle stagioni future conta solo i contratti che continuano, sul cap base", () => {
    const [, next, after] = capPlan(team, 2026, S).seasons;
    expect(next.starters).toBe(70); // 40 + 30
    expect(next.options).toBe(0);
    expect(next.cuts).toBe(3.5); // il taglio definitivo dura 2 anni, quello in asta 1
    expect(next.unknown).toBe(12); // durata da fissare: fuori dal totale
    expect(next.payroll).toBe(73.5);
    expect(next.cap).toBe(S.cap);
    expect(next.capKind).toBe("base");
    expect(next.capRange).toEqual([247, 255]); // R-60: da -3 a +5
    expect(next.starterCount).toBe(2);
    expect(next.openSlots).toBe(11);
    expect(next.reserves).toBe(10);
    expect(after.payroll).toBe(40);
  });

  it("team option esercitata: un anno in più allo stesso stipendio, poi unrestricted (R-22/R-23)", () => {
    const base = capPlan(team, 2026, S);
    const row = (p: typeof base) => p.rows.find((r) => r.id === option.id)!;
    expect(base.optionIds).toEqual([option.id]);
    expect(row(base).cells).toEqual(["full", "option-off", null]);
    expect(row(base).exit).toEqual({ year: 2026, restricted: true });

    const on = capPlan(team, 2026, S, { ...BASE_SCENARIO, exercised: [option.id] });
    expect(row(on).cells).toEqual(["full", "option", null]);
    expect(row(on).exit).toEqual({ year: 2027, restricted: false });
    expect(on.seasons[1].options).toBe(20);
    expect(on.seasons[1].payroll).toBe(93.5);
    expect(on.seasons[1].starterCount).toBe(3);
    expect(on.seasons[0].payroll).toBe(base.seasons[0].payroll); // oggi non cambia
  });

  it("uscita a fine contratto: mezza stagione e secondo contratto unrestricted, gli altri restricted (R-23/R-24)", () => {
    const rows = capPlan(team, 2026, S).rows;
    const exit = (id: number) => rows.find((r) => r.id === id)!.exit;
    expect(exit(half.id)).toEqual({ year: 2026, restricted: false });
    expect(exit(second.id)).toEqual({ year: 2026, restricted: false });
    expect(exit(two.id)).toEqual({ year: 2027, restricted: true });
    expect(exit(unknown.id)).toBeNull();
    expect(rows.find((r) => r.id === half.id)!.cells).toEqual(["half", null, null]);
  });

  it("taglio in asta preso da un'altra squadra: sparisce dalle stagioni future, oggi resta", () => {
    const longPending = cut(2, 2, "pending");
    const t = { ...team, cuts: [longPending] };
    const kept = capPlan(t, 2026, S);
    const taken = capPlan(t, 2026, S, { ...BASE_SCENARIO, pendingCutsTaken: true });
    expect(kept.seasons[1].cuts).toBe(2);
    expect(taken.seasons[1].cuts).toBe(0);
    expect(taken.seasons[0].cuts).toBe(2);
    expect(taken.rows[taken.rows.length - 1].cells).toEqual(["full", "taken", null]);
  });

  it("piazzamento ipotetico: bonus R-60 sul cap delle stagioni future, mai su quella corrente", () => {
    const third = capPlan(team, 2026, S, { ...BASE_SCENARIO, rank: 3 });
    expect(third.seasons[0].cap).toBe(248);
    expect(third.seasons[1].cap).toBe(253);
    expect(third.seasons[1].capKind).toBe("hypothetical");
    const last = capPlan(team, 2026, S, { ...BASE_SCENARIO, rank: 8 });
    expect(last.seasons[2].cap).toBe(247);
  });

  it("crediti medi per posto da titolare libero", () => {
    const next = capPlan(team, 2026, S).seasons[1];
    expect(perOpenSlot(next)).toBe(16.0); // (250 - 73.5) / 11 = 16.04
    expect(perOpenSlot({ ...next, openSlots: 0 })).toBeNull();
  });
});
