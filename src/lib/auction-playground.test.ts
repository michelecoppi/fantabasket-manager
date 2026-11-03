import { describe, expect, it } from "vitest";
import { PROPOSED_RULES } from "./auction";
import { seeded } from "./auction-bots";
import { buildScenario, type PlaygroundData, type RosterPick } from "./auction-playground";
import { DEFAULT_SETTINGS } from "./cap";

const teamIds = ["a", "b", "c", "d"];
let n = 0;
const rostered: RosterPick[] = teamIds.flatMap((teamId) =>
  [20, 12, 8, 6, 5].map((salary) => ({ playerId: ++n, contractId: 100 + n, teamId, name: `P${n}`, pos: "G" as const, nbaTeam: null, salary, pdk: null })),
);
const data: PlaygroundData = {
  teams: teamIds.map((id) => ({
    id,
    name: id.toUpperCase(),
    color: "#000",
    side: { roster: rostered.filter((r) => r.teamId === id).map((r) => ({ id: r.contractId, position: r.pos, slot: "starter" as const, salary: r.salary })), cuts: [], bonus: 2 },
  })),
  free: [9, 7.5, 3].map((credits, i) => ({ id: 900 + i, name: `F${i}`, pos: "A" as const, nbaTeam: null, credits, pdk: null, floor: null, restrictedTeamId: null })),
  rostered,
  settings: DEFAULT_SETTINGS,
  today: "2026-11-02",
};

describe("scenari del playground", () => {
  it("oggi, senza esempi: rose vere e free agent alla metà dei crediti", () => {
    const sc = buildScenario(data, "today", false, "a", PROPOSED_RULES, seeded(1));
    expect(sc.teams.find((t) => t.id === "a")?.side.roster).toHaveLength(5);
    expect(sc.pool.map((p) => [p.player.id, p.base])).toEqual([[900, 4.5], [901, 4], [902, 1.5]]);
    expect(sc.cutQueue).toEqual([]);
    expect([...sc.order].sort()).toEqual(teamIds);
    expect(sc.order[0]).toBe("a"); // nel playground chiami per primo tu
  });

  it("da zero: rose vuote (resta il bonus), tutti all'asta, chi è in rosa vale il suo stipendio", () => {
    const sc = buildScenario(data, "zero", false, "a", PROPOSED_RULES, seeded(1));
    expect(sc.teams.every((t) => t.side.roster.length === 0 && t.side.bonus === 2)).toBe(true);
    expect(sc.pool).toHaveLength(rostered.length + 3);
    expect(sc.pool[0]).toMatchObject({ valueLabel: "stipendio di oggi", base: 10 });
  });

  it("esempi: due tagliati di squadre diverse in coda, il posto si libera e la quota resta (R-42)", () => {
    const sc = buildScenario(data, "today", true, "a", PROPOSED_RULES, seeded(5));
    expect(sc.cutQueue).toHaveLength(2);
    const owners = sc.cutQueue.map((c) => c.formerTeamId);
    expect(new Set(owners).size).toBe(2);
    expect(owners).not.toContain("a");
    for (const c of sc.cutQueue) {
      const team = sc.teams.find((t) => t.id === c.formerTeamId)!;
      expect(team.side.roster).toHaveLength(4);
      expect(team.side.cuts).toHaveLength(1);
      expect(c.base).toBe(c.player.credits / 2); // R-25: metà dell'ultimo stipendio
      expect(sc.pool.some((p) => p.player.id === c.player.id)).toBe(false);
    }
  });

  it("esempi: un restricted è tuo, così provi il pareggio (R-23)", () => {
    for (const mode of ["today", "zero"] as const) {
      const sc = buildScenario(data, mode, true, "a", PROPOSED_RULES, seeded(9));
      const restricted = sc.pool.filter((p) => p.kind === "restricted");
      expect(restricted).toHaveLength(2);
      expect(restricted.map((p) => p.formerTeamId)).toContain("a");
      expect(restricted.every((p) => p.example)).toBe(true);
    }
  });
});
