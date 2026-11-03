import { describe, expect, it } from "vitest";
import { homeTodo } from "./home-todo";
import type { SlotSwapRequest } from "./slot-swap";
import { toProposal, type ProposalRow, type ProposalStatus } from "./trade-proposals";

const NOW = Date.parse("2026-11-03T12:00:00Z");

const proposal = (id: number, status: ProposalStatus, proposer = "a", answered: string[] = []) =>
  toProposal(
    {
      id,
      version: 1,
      status,
      proposer_team_id: proposer,
      teams: ["a", "b"],
      moves: [],
      message: null,
      cap_exception_reason: null,
      created_at: new Date(NOW - 3_600_000).toISOString(),
      expires_at: new Date(NOW + 3_600_000).toISOString(),
      decided_at: null,
      decision_note: null,
      parent_id: null,
      trade_id: null,
      dunkest_done_at: null,
      trade_proposal_answers: answered.map((team_id) => ({ team_id, answer: "accept", note: null, at: new Date(NOW).toISOString() })),
    } satisfies ProposalRow,
    NOW,
  );

const swap = (teamId: string, status: SlotSwapRequest["status"]): SlotSwapRequest => ({ id: 1, version: 1, teamId, status, items: [], createdAt: "", decidedAt: null, decisionNote: null });

const base = { teamId: "b", admin: false, proposals: [], swaps: [], swapWindowOpen: false, marketOpen: false };
const keys = (x: Parameters<typeof homeTodo>[0]) => homeTodo(x).map((t) => t.key);

describe("«Da fare» in home", () => {
  it("niente in corso: lista vuota", () => {
    expect(homeTodo(base)).toEqual([]);
  });

  it("proposta che aspetta la mia risposta, con il numero e il link alle proposte", () => {
    const [t] = homeTodo({ ...base, proposals: [proposal(1, "pending"), proposal(2, "pending")] });
    expect(t).toMatchObject({ key: "answer", n: 2, href: "/scambio?vista=proposte", action: true, text: "2 proposte di scambio aspettano la tua risposta" });
  });

  it("non conta le proposte già risposte o fatte da me", () => {
    expect(keys({ ...base, proposals: [proposal(1, "pending", "a", ["b"]), proposal(2, "pending", "b")] })).toEqual([]);
  });

  it("la mia proposta accettata aspetta l'admin (informazione)", () => {
    expect(homeTodo({ ...base, teamId: "a", proposals: [proposal(1, "accepted")] })).toMatchObject([{ key: "accepted", action: false }]);
  });

  it("cambio titolari/riserve: in attesa se l'ho chiesto, altrimenti finestra aperta", () => {
    expect(keys({ ...base, swaps: [swap("b", "pending")], swapWindowOpen: true })).toEqual(["swap-pending"]);
    expect(keys({ ...base, swaps: [swap("c", "pending")], swapWindowOpen: true })).toEqual(["swap-open"]);
    expect(homeTodo({ ...base, swapWindowOpen: true })[0].href).toBe("/squadre/b#cambio");
  });

  it("per un admin anche la coda admin; prima ciò che tocca a te", () => {
    expect(keys({ ...base, admin: true, marketOpen: true, proposals: [proposal(1, "accepted")], swaps: [swap("c", "pending")] })).toEqual([
      "admin-scambio accettato da approvare",
      "admin-cambio titolari/riserve da approvare",
      "market",
    ]);
  });

  it("dati non letti o senza squadra: le voci si saltano", () => {
    expect(homeTodo({ ...base, teamId: null, proposals: null, swaps: null, swapWindowOpen: true, marketOpen: null })).toEqual([]);
  });
});
