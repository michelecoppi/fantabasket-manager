import { describe, expect, it } from "vitest";
import { PROPOSED_RULES as R } from "./auction";
import type { PoolEntry, Scenario } from "./auction-playground";
import { canCall, createRoom, limitFor, roomReducer, type Room, type RoomAction } from "./auction-room";
import { DEFAULT_SETTINGS as S } from "./cap";

const entry = (id: number, base: number, kind: PoolEntry["kind"] = "free", formerTeamId: string | null = null): PoolEntry => ({
  player: { id, name: `P${id}`, pos: "G", nbaTeam: null, credits: base * 2, pdk: null },
  kind,
  formerTeamId,
  base,
  valueLabel: "crediti Dunkest",
  example: false,
});
const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  teams: ["a", "b", "c"].map((id) => ({ id, name: id, color: "#000", side: { roster: [], cuts: [], bonus: 0 } })),
  pool: [entry(1, 10), entry(2, 4)],
  cutQueue: [],
  order: ["a", "b", "c"],
  ...over,
});
const run = (room: Room, ...actions: RoomAction[]) => actions.reduce(roomReducer, room);

describe("sala d'asta", () => {
  it("chiama chi è di turno, si rilancia, allo scadere l'acquisto entra in rosa", () => {
    let room = createRoom(scenario(), S, R, 0);
    expect(room.caller).toBe("a");
    expect(run(room, { type: "call", teamId: "b", playerId: 1, amount: 10, now: 0 }).lot).toBeNull(); // non è il suo turno
    room = run(room, { type: "call", teamId: "a", playerId: 1, amount: 10, now: 1000 }, { type: "bid", teamId: "b", amount: 10.5, now: 2000 });
    expect(room.lot?.bids.map((b) => b.teamId)).toEqual(["a", "b"]);
    expect(room.pool.map((p) => p.player.id)).toEqual([2]);
    room = run(room, { type: "bid", teamId: "c", amount: 10.5, now: 3000 });
    expect(room.error?.text).toMatch(/pareggio non vince/);
    room = run(room, { type: "tick", now: room.lot!.deadline });
    expect(room.sales).toHaveLength(1);
    expect(room.sales[0]).toMatchObject({ teamId: "b", amount: 10.5, slot: "starter", bids: 2 });
    expect(room.teams.find((t) => t.id === "b")?.side.roster).toHaveLength(1);
    room = run(room, { type: "next", now: 20_000 });
    expect(room.caller).toBe("b");
  });

  it("prima l'asta dei tagliati, chiamata dall'app: l'ex proprietario non offre (R-41)", () => {
    let room = createRoom(scenario({ cutQueue: [entry(9, 3, "cut", "c")] }), S, R, 0);
    expect(room.lot?.player.id).toBe(9);
    expect(room.lot?.bids).toEqual([]);
    expect(room.caller).toBeNull();
    room = run(room, { type: "bid", teamId: "c", amount: 3, now: 100 });
    expect(room.error?.text).toMatch(/R-41/);
    room = run(room, { type: "tick", now: room.lot!.deadline }, { type: "next", now: 16_000 });
    expect(room.unsold.map((u) => u.player.id)).toEqual([9]);
    expect(room.caller).toBe("a");
  });

  it("diritto di pareggio: chi lo ha pareggia l'offerta più alta (R-23)", () => {
    let room = createRoom(scenario({ pool: [entry(5, 6, "restricted", "c")] }), S, R, 0);
    room = run(room, { type: "call", teamId: "a", playerId: 5, amount: 6, now: 0 }, { type: "bid", teamId: "b", amount: 8, now: 1000 });
    room = run(room, { type: "tick", now: room.lot!.deadline });
    expect(room.lot?.phase).toBe("match");
    room = run(room, { type: "match", teamId: "c", now: room.lot!.deadline - 1 });
    expect(room.sales[0]).toMatchObject({ teamId: "c", amount: 8, matched: true });
  });

  it("se passano tutti l'asta è ferma; l'admin la chiude e il lotto aperto va a chi è in testa", () => {
    let room = createRoom(scenario(), S, R, 0);
    room = run(room, { type: "pass", teamId: "a", now: 1 }, { type: "pass", teamId: "b", now: 2 }, { type: "pass", teamId: "c", now: 3 });
    expect(room.caller).toBeNull();
    room = createRoom(scenario(), S, R, 0);
    room = run(room, { type: "call", teamId: "a", playerId: 2, amount: 4, now: 0 }, { type: "end", now: 500 });
    expect(room.ended).toBe(true);
    expect(room.sales[0]).toMatchObject({ teamId: "a", amount: 4 });
    expect(run(room, { type: "pass", teamId: "b", now: 600 })).toBe(room);
  });

  it("limiti: rosa vuota = cap pieno più la zona della luxury tax", () => {
    const room = createRoom(scenario(), S, R, 0);
    expect(limitFor(room, "a", "G")).toBe(S.cap + S.taxMaxOver);
    expect(canCall(room, "a")).toBe(true);
  });
});
