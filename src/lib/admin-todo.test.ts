import { describe, expect, it } from "vitest";
import { adminTodo, adminTodoCounts } from "./admin-todo";
import type { SlotSwapRequest } from "./slot-swap";
import { toProposal, type ProposalRow, type ProposalStatus } from "./trade-proposals";

const NOW = Date.parse("2026-11-03T12:00:00Z");

const proposal = (id: number, status: ProposalStatus, dunkest_done_at: string | null = null) =>
  toProposal(
    {
      id,
      version: 1,
      status,
      proposer_team_id: "a",
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
      dunkest_done_at,
      trade_proposal_answers: [],
    } satisfies ProposalRow,
    NOW,
  );

const swap = (id: number, status: SlotSwapRequest["status"]): SlotSwapRequest => ({ id, version: 1, teamId: "a", status, items: [], createdAt: "", decidedAt: null, decisionNote: null });

describe("coda degli admin (badge su «Admin»)", () => {
  it("dice da dove arriva ogni numero e dove si gestisce", () => {
    const todo = adminTodo(
      [proposal(1, "pending"), proposal(2, "accepted"), proposal(3, "accepted"), proposal(4, "approved"), proposal(5, "approved", "x")],
      [swap(1, "pending"), swap(2, "approved")],
    );
    expect(todo).toEqual([
      { tool: "/admin/scambio", href: "/admin/scambio#proposte", n: 2, text: "scambi accettati da approvare" },
      { tool: "/admin/scambio", href: "/admin/scambio#proposte", n: 1, text: "scambio da rifare su Dunkest" },
      { tool: "/admin/rose", href: "/admin/rose#cambi", n: 1, text: "cambio titolari/riserve da approvare" },
    ]);
    expect(adminTodoCounts(todo)).toEqual({ "/admin": 4, "/admin/scambio": 3, "/admin/rose": 1 });
  });

  it("senza niente in coda: nessuna voce e nessun numero", () => {
    const todo = adminTodo([proposal(1, "pending")], [swap(1, "declined")]);
    expect(todo).toEqual([]);
    expect(adminTodoCounts(todo)).toEqual({});
  });
});
