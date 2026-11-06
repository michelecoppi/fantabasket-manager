import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S, evaluateSlotSwap, type Position, type TradeSide } from "./cap";
import { buildLeague, type SettingRow, type Versions } from "./league";
import { evaluateSlotSwapItems, parseSlotSwapItems, pendingSwaps, slotSwapLabel, slotSwapLines, toSlotSwap } from "./slot-swap";

// Rosa completa: 13 titolari (5 G, 5 A, 3 C) da `starterSalary` l'uno e 3 riserve (una per ruolo).
// id: titolari 1-13 (G 1-5, A 6-10, C 11-13), riserve 21 (G), 22 (A), 23 (C).
function team({ starterSalary = 18, reserves = [10, 10, 10], bonus = 0 } = {}): TradeSide {
  const pos: Position[] = ["G", "G", "G", "G", "G", "A", "A", "A", "A", "A", "C", "C", "C"];
  return {
    roster: [
      ...pos.map((position, i) => ({ id: i + 1, position, slot: "starter" as const, salary: starterSalary })),
      ...(["G", "A", "C"] as const).map((position, i) => ({ id: 21 + i, position, slot: "reserve" as const, salary: reserves[i] })),
    ],
    cuts: [],
    bonus,
  };
}
const swap = (...pairs: [number, "starter" | "reserve"][]) => new Map(pairs);

describe("evaluateSlotSwap (R-04)", () => {
  it("un cambio ruolo per ruolo che sta nei budget passa", () => {
    // monte 13 × 18 = 234; sale la riserva G da 10, scende un titolare G da 18 → 226; riserve 30 → 38
    const ev = evaluateSlotSwap(team(), swap([21, "starter"], [1, "reserve"]), S);
    expect(ev.errors).toEqual([]);
    expect(ev.warnings).toEqual([]);
    expect(ev.impact.after.payroll).toBe(226);
    expect(ev.impact.after.reserveSpace).toBe(42);
  });

  it("più giocatori insieme, uno per ruolo", () => {
    const ev = evaluateSlotSwap(team(), swap([21, "starter"], [1, "reserve"], [22, "starter"], [6, "reserve"]), S);
    expect(ev.errors).toEqual([]);
  });

  it("ruolo per ruolo: una guardia non sale al posto di un'ala", () => {
    const ev = evaluateSlotSwap(team(), swap([21, "starter"], [6, "reserve"]), S);
    expect(ev.errors).toContain("Il cambio è ruolo per ruolo (R-04): G, salgono 1 e scendono 0.");
    expect(ev.errors).toContain("Il cambio è ruolo per ruolo (R-04): A, salgono 0 e scendono 1.");
  });

  it("salire senza che nessuno scenda è bloccato", () => {
    const ev = evaluateSlotSwap(team(), swap([21, "starter"]), S);
    expect(ev.unbalanced).toEqual([{ pos: "G", up: 1, down: 0 }]);
    // i massimi di rosa sforati sono una conseguenza: resta solo l'errore di R-04
    expect(ev.errors).toEqual(["Il cambio è ruolo per ruolo (R-04): G, salgono 1 e scendono 0."]);
  });

  it("le riserve oltre il budget bloccano (R-04: solo se fattibile in crediti)", () => {
    // riserve 10 + 10 + 10 = 30; scende un titolare da 70 al posto della riserva G da 10 → 90 > 80
    const side = team();
    side.roster[0].salary = 70;
    const ev = evaluateSlotSwap(side, swap([21, "starter"], [1, "reserve"]), S);
    expect(ev.errors).toContain("Le riserve superano il budget di 80 di 10 crediti (R-03, R-04).");
  });

  it("sopra il cap avvisa con la luxury tax", () => {
    // monte 13 × 19 = 247; sale una riserva G da 30 al posto di un titolare G da 19 → 258: 8 sopra il cap, 2 €
    const ev = evaluateSlotSwap(team({ starterSalary: 19, reserves: [30, 10, 10] }), swap([21, "starter"], [1, "reserve"]), S);
    expect(ev.errors).toEqual([]);
    expect(ev.warnings).toEqual(["Dopo il cambio il monte ingaggi supera il cap di 8: luxury tax di 2 € (R-10, R-12)."]);
  });

  it("oltre cap effettivo + massimo tassabile blocca", () => {
    // 247 - 19 + 45 = 273 > 250 + 20
    const ev = evaluateSlotSwap(team({ starterSalary: 19, reserves: [45, 10, 10] }), swap([21, "starter"], [1, "reserve"]), S);
    expect(ev.payrollLimit).toBe(270);
    expect(ev.errors).toContain("Il monte ingaggi arriva a 273, oltre il massimo di 270 (cap 250 + 20 tassabili, R-12).");
  });

  it("il limite assoluto segue il bonus del cap (R-11)", () => {
    const ev = evaluateSlotSwap(team({ starterSalary: 19, reserves: [45, 10, 10], bonus: 5 }), swap([21, "starter"], [1, "reserve"]), S);
    expect(ev.payrollLimit).toBe(275);
    expect(ev.errors).toEqual([]);
    expect(ev.warnings).toHaveLength(1);
  });

  it("ASSUNZIONE: chi è già oltre i limiti può fare un cambio che migliora", () => {
    // monte 13 × 22 = 286 (oltre 270); scende un titolare da 22, sale una riserva da 10 → 274, ancora oltre ma meglio
    const ev = evaluateSlotSwap(team({ starterSalary: 22 }), swap([21, "starter"], [1, "reserve"]), S);
    expect(ev.errors).toEqual([]);
    expect(ev.impact.after.payroll).toBe(274);
  });

  it("giocatori assenti, senza ruolo o già nello slot sono errori", () => {
    const side = team();
    side.roster[1].position = null;
    expect(evaluateSlotSwap(side, swap([99, "starter"]), S).errors).toContain("Un giocatore del cambio non è più nella rosa.");
    expect(evaluateSlotSwap(side, swap([2, "reserve"]), S).errors).toContain(
      "Un giocatore senza ruolo non si può spostare: un admin deve prima indicarne il ruolo.",
    );
    expect(evaluateSlotSwap(side, swap([1, "starter"]), S).errors).toContain("Un giocatore è già titolare.");
    expect(evaluateSlotSwap(side, new Map(), S).errors).toContain("Scegli chi sale tra i titolari e chi scende tra le riserve.");
  });
});

describe("richieste salvate", () => {
  // Stesse chiavi di supabase/seed.sql: ogni chiave è obbligatoria.
  const settings: SettingRow[] = Object.entries({
    cap: 250, reserve_budget: 80, floor_divisor: 5, tax_credits_per_euro: 5, tax_max_over: 20,
    starters_g: 5, starters_a: 5, starters_c: 3, reserve_min: 3, reserve_max: 6, reserve_max_per_pos: 3,
    contract_max_years: 3, rookie_max_years: 2, last_contract_min_fraction: 0.5, last_contract_valid_months: 12, max_picks_per_round: 2, pick_horizon_years: 3, draft_rounds: 5,
    rank_bonus_1: 5, rank_bonus_2: 4, rank_bonus_3: 3, rank_bonus_4: 2, rank_bonus_5: 0, rank_bonus_6: -1, rank_bonus_7: -2, rank_bonus_8: -3,
    lottery_teams: 4, lottery_weight_1: 4, lottery_weight_2: 3, lottery_weight_3: 2, lottery_weight_4: 1, trade_max_teams: 4, trade_proposal_hours: 24,
  }).map(([key, value]) => ({ key, value }));
  const contract = (id: number, slot: "starter" | "reserve", salary: number) => ({
    id, player_id: id, team_id: "a", slot, years_left: 1, team_option: false, salary, restriction: null, is_rookie: false,
    players: { first_name: "Nome", last_name: `P${id}`, pos: "G" as const, nba_team: null },
  });
  const league = buildLeague({
    seasonYear: 2026,
    teams: [{ id: "a", name: "Alfa", owner_name: "A" }],
    settings,
    contracts: [contract(1, "starter", 20), contract(2, "reserve", 5)],
    cuts: [],
    talents: [],
    picks: [],
    teamSeason: [],
    rookieDraft: [],
  });
  const items = [
    { id: 1, version: 3, slot: "reserve" as const, label: "Nome P1" },
    { id: 2, version: 1, slot: "starter" as const },
  ];
  const versions = (contracts: Record<number, number>): Versions => ({ contracts, picks: {}, cuts: {}, talents: {}, teamSeason: {}, rosterRev: {} });

  it("legge i giocatori salvati e scarta quelli malformati", () => {
    expect(parseSlotSwapItems([...items, { id: 3, version: 1, slot: "talent" }, { id: 4, slot: "starter" }, "x"])).toEqual(items);
    expect(parseSlotSwapItems(null)).toEqual([]);
    const r = toSlotSwap({ id: 7, version: 2, team_id: "a", status: "pending", items, created_at: "2026-11-03T10:00:00Z", decided_at: null, decision_note: null });
    expect(r).toMatchObject({ id: 7, teamId: "a", status: "pending", items });
    expect(pendingSwaps([r, { ...r, id: 8, status: "approved" }]).map((x) => x.id)).toEqual([7]);
  });

  it("valuta sulla rosa di adesso e trova i giocatori cambiati", () => {
    const check = evaluateSlotSwapItems(league, "a", items, versions({ 1: 3, 2: 1 }))!;
    expect(check.stale).toEqual([]);
    expect(check.ev.impact.after.payroll).toBe(5);
    expect(evaluateSlotSwapItems(league, "a", items, versions({ 1: 4, 2: 1 }))!.stale.map((i) => i.id)).toEqual([1]);
    expect(evaluateSlotSwapItems(league, "a", [{ id: 99, version: 1, slot: "starter" }])!.stale.map((i) => i.id)).toEqual([99]);
    expect(evaluateSlotSwapItems(league, "z", items)).toBeNull();
  });

  it("chi sale e chi scende, con l'etichetta salvata se il giocatore non c'è più", () => {
    expect(slotSwapLines(league, "a", [...items, { id: 99, version: 1, slot: "starter", label: "Andato" }])).toEqual({
      up: [
        { id: 2, name: "Nome P2", pos: "G", salary: 5, slot: "starter" },
        { id: 99, name: "Andato", pos: null, salary: null, slot: "starter" },
      ],
      down: [{ id: 1, name: "Nome P1", pos: "G", salary: 20, slot: "reserve" }],
    });
    expect(slotSwapLabel(league, "a", 2)).toBe("Nome P2");
    expect(slotSwapLabel(league, "a", 99)).toBeUndefined();
  });
});
