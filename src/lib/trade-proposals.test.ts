import { describe, expect, it } from "vitest";
import { buildLeague, type RawLeague, type SettingRow } from "./league";
import {
  awaitsAnswer,
  evaluateMoves,
  groupProposals,
  joinNames,
  moveLabel,
  parseProposalMoves,
  proposalBadges,
  timeLeft,
  toProposal,
  type Proposal,
  type ProposalRow,
} from "./trade-proposals";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const H = 3_600_000;

const row = (over: Partial<ProposalRow> = {}): ProposalRow => ({
  id: 1,
  version: 1,
  status: "pending",
  proposer_team_id: "a",
  teams: ["a", "b"],
  moves: [{ kind: "contract", id: 1, version: 1, from: "a", to: "b", label: "Flagg" }],
  message: null,
  cap_exception_reason: null,
  created_at: new Date(NOW - H).toISOString(),
  expires_at: new Date(NOW + 5 * H).toISOString(),
  decided_at: null,
  decision_note: null,
  parent_id: null,
  trade_id: null,
  dunkest_done_at: null,
  trade_proposal_answers: [],
  ...over,
});
const p = (over: Partial<ProposalRow> = {}): Proposal => toProposal(row(over), NOW);
const ids = (g: Proposal[]) => g.map((x) => x.id);

describe("proposte di scambio (Fase 7)", () => {
  it("una proposta in attesa oltre la scadenza vale già come scaduta", () => {
    expect(p().status).toBe("pending");
    expect(p().msLeft).toBe(5 * H);
    const late = p({ expires_at: new Date(NOW - 1).toISOString() });
    expect(late.status).toBe("expired");
    expect(late.msLeft).toBeNull();
    expect(late.decidedAt).toBe(new Date(NOW - 1).toISOString());
    // accettata da tutte: aspetta l'admin senza scadenza (decisione del 2026-10-29)
    expect(p({ status: "accepted", expires_at: new Date(NOW - H).toISOString() }).status).toBe("accepted");
  });

  it("legge i movimenti salvati e scarta quelli malformati", () => {
    expect(
      parseProposalMoves([
        { kind: "contract", id: 1, version: 2, from: "a", to: "b", slot: "reserve", label: "X" },
        { kind: "pick", id: 5, version: 1, from: "b", to: "a", slot: "starter" },
        { kind: "contract", id: 2, from: "a", to: "b" },
        { kind: "boh", id: 3, version: 1, from: "a", to: "b" },
        null,
      ]),
    ).toEqual([
      { kind: "contract", id: 1, version: 2, from: "a", to: "b", slot: "reserve", label: "X" },
      { kind: "pick", id: 5, version: 1, from: "b", to: "a" },
    ]);
    expect(parseProposalMoves("no")).toEqual([]);
  });

  it("aspetta la risposta solo delle controparti che non hanno ancora risposto", () => {
    const three = p({ teams: ["a", "b", "c"], trade_proposal_answers: [{ team_id: "b", answer: "accept", note: null, at: "" }] });
    expect(awaitsAnswer(three, "a")).toBe(false); // ha proposto
    expect(awaitsAnswer(three, "b")).toBe(false); // ha già accettato
    expect(awaitsAnswer(three, "c")).toBe(true);
    expect(awaitsAnswer(three, "d")).toBe(false); // estranea
    expect(awaitsAnswer(three, null)).toBe(false);
    expect(awaitsAnswer(p({ status: "accepted" }), "b")).toBe(false);
  });

  it("raggruppa per chi guarda: da rispondere, in corso, altre (admin), archivio", () => {
    const list = [
      p({ id: 1 }),
      p({ id: 2, proposer_team_id: "b", expires_at: new Date(NOW + H).toISOString() }),
      p({ id: 3, status: "accepted" }),
      p({ id: 4, teams: ["c", "d"], proposer_team_id: "c" }),
      p({ id: 5, status: "rejected", decided_at: new Date(NOW - 2 * H).toISOString() }),
      p({ id: 6, status: "approved", decided_at: new Date(NOW - H).toISOString() }),
      p({ id: 7, expires_at: new Date(NOW - 3 * H).toISOString() }),
    ];
    const forB = groupProposals(list, "b");
    expect(ids(forB.toAnswer)).toEqual([1]);
    expect(ids(forB.open)).toEqual([2, 3]);
    expect(ids(forB.others)).toEqual([4]);
    expect(ids(forB.archive)).toEqual([6, 5, 7]);
    const forA = groupProposals(list, "a");
    expect(ids(forA.toAnswer)).toEqual([2]);
    expect(ids(forA.open)).toEqual([1, 3]);
    // admin senza squadra: tutto ciò che è aperto sta tra le «altre»
    expect(ids(groupProposals(list, null).others)).toEqual([1, 2, 3, 4]);
  });

  it("badge: risposte attese dalla squadra e, per un admin, approvazioni e Dunkest in coda", () => {
    const list = [p({ id: 1 }), p({ id: 2, status: "accepted" }), p({ id: 3, status: "approved" }), p({ id: 4, status: "approved", dunkest_done_at: "x" })];
    expect(proposalBadges(list, "b", false)).toEqual({ answer: 1, admin: 0 });
    expect(proposalBadges(list, "b", true)).toEqual({ answer: 1, admin: 2 });
    expect(proposalBadges(list, "a", true)).toEqual({ answer: 0, admin: 2 });
  });

  it("scrive il tempo che resta e i nomi delle squadre", () => {
    expect(timeLeft(0)).toBe("scaduta");
    expect(timeLeft(30_000)).toBe("1 min");
    expect(timeLeft(45 * 60_000)).toBe("45 min");
    expect(timeLeft(H + 20 * 60_000)).toBe("1 h 20 min");
    expect(timeLeft(18 * H + 59 * 60_000)).toBe("18 h");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B", "C"])).toBe("A, B e C");
  });
});

describe("evaluateMoves", () => {
  // Stesse chiavi di supabase/seed.sql: ogni chiave è obbligatoria.
  const settings: SettingRow[] = Object.entries({
    cap: 250, reserve_budget: 80, floor_divisor: 5, tax_credits_per_euro: 4, tax_max_over: 20,
    starters_g: 5, starters_a: 5, starters_c: 3, reserve_min: 3, reserve_max: 6, reserve_max_per_pos: 3,
    contract_max_years: 3, rookie_max_years: 2, last_contract_min_fraction: 0.5, last_contract_valid_months: 12, max_picks_per_round: 2, pick_horizon_years: 3, draft_rounds: 5,
    rank_bonus_1: 5, rank_bonus_2: 4, rank_bonus_3: 3, rank_bonus_4: 2, rank_bonus_5: 0, rank_bonus_6: -1, rank_bonus_7: -2, rank_bonus_8: -3,
    lottery_teams: 4, trade_max_teams: 4, trade_proposal_hours: 24,
  }).map(([key, value]) => ({ key, value }));
  const contract = (id: number, team: string, salary: number) => ({
    id, player_id: id, team_id: team, slot: "starter" as const, years_left: 1, team_option: false, salary, restriction: null, is_rookie: false,
    players: { first_name: "", last_name: `P${id}`, pos: "G" as const, nba_team: null },
  });
  const raw: RawLeague = {
    seasonYear: 2026,
    teams: [
      { id: "a", name: "Alfa", owner_name: "A" },
      { id: "b", name: "Beta", owner_name: "B" },
    ],
    settings,
    contracts: [contract(1, "a", 30), contract(2, "b", 240)],
    cuts: [],
    talents: [
      { id: 20, team_id: "a", player_id: 900, players: { first_name: "Cooper", last_name: "Flagg", pos: "A", nba_team: "DAL" }, display_name: "C.Flagg", draft_year: 2025, entry_credits: 9.5, notes: null },
      { id: 21, team_id: "b", player_id: null, players: null, display_name: "Estero", draft_year: null, entry_credits: null, notes: null },
    ],
    picks: [{ id: 10, year: 2027, round: 1, original_team_id: "b", current_team_id: "a", to_confirm: false, note: null }],
    teamSeason: [],
    rookieDraft: [],
  };
  const league = buildLeague(raw);
  const moves = [{ kind: "contract" as const, id: 1, version: 1, from: "a", to: "b" }];

  it("valuta come il simulatore e segnala chi sfora il cap", () => {
    const { ev, stale, names } = evaluateMoves(league, ["a", "b"], moves);
    expect(names).toEqual(["Alfa", "Beta"]);
    expect(stale).toEqual([]);
    expect(ev.impacts.map((i) => i.after.payroll)).toEqual([0, 270]);
    expect(ev.capBreakers).toEqual(["Beta"]);
  });

  it("con le versioni trova i movimenti cambiati; squadra inesistente = names undefined", () => {
    expect(evaluateMoves(league, ["a", "b"], moves, { contracts: { 1: 2 }, picks: {} }).stale).toHaveLength(1);
    expect(evaluateMoves(league, ["a", "b"], moves, { contracts: { 1: 1 }, picks: {} }).stale).toHaveLength(0);
    expect(evaluateMoves(league, ["a", "z"], moves).names).toBeUndefined();
  });

  it("etichetta giocatori e pick come lo storico degli scambi", () => {
    expect(moveLabel(league, { kind: "contract", id: 2 })).toBe("P2");
    expect(moveLabel(league, { kind: "pick", id: 10 })).toBe("Draft 2027 · 1° giro (Beta)");
    expect(moveLabel(league, { kind: "contract", id: 99 })).toBeUndefined();
  });

  it("talenti (7.6): etichetta, esito senza effetto sul cap, versione cambiata = stale", () => {
    expect(moveLabel(league, { kind: "talent", id: 20 })).toBe("Cooper Flagg (draft 2025)");
    expect(moveLabel(league, { kind: "talent", id: 21 })).toBe("Estero");
    expect(moveLabel(league, { kind: "talent", id: 99 })).toBeUndefined();
    const swap = [
      { kind: "talent" as const, id: 20, version: 1, from: "a", to: "b" },
      { kind: "talent" as const, id: 21, version: 1, from: "b", to: "a" },
    ];
    const { ev } = evaluateMoves(league, ["a", "b"], swap);
    expect(ev.errors).toEqual([]);
    expect(ev.impacts.map((i) => i.after.payroll)).toEqual([30, 240]);
    expect(evaluateMoves(league, ["a", "b"], swap, { contracts: {}, picks: {}, talents: { 20: 2, 21: 1 } }).stale.map((m) => m.id)).toEqual([20]);
    expect(parseProposalMoves([{ ...swap[0], label: "Cooper Flagg (draft 2025)", slot: "reserve" }])).toEqual([{ ...swap[0], label: "Cooper Flagg (draft 2025)" }]);
  });
});
