import { describe, expect, it } from "vitest";
import { tradeCardModel, type TradeCardInput, type TradedPlayer } from "./trade-card";
import { parseTrade } from "./trades";

const teams = new Map([
  ["a", { name: "OKCC", color: "#c75d0c" }],
  ["b", { name: "Chicago Spaccinos", color: "#b3246f" }],
  ["c", { name: "Dame Time", color: "#0a7ba0" }],
]);
const player = (over: Partial<TradedPlayer> = {}): TradedPlayer => ({ playerId: 1, name: "Jalen Williams", pos: "G", salary: 24, yearsLeft: 2, rookie: false, ...over });

const input = (payload: unknown, over: Partial<TradeCardInput> = {}): TradeCardInput => ({
  trade: { id: 7, createdAt: "2026-10-29T10:00:00Z", capOverrideReason: null, view: parseTrade(payload) },
  teams,
  tradesPerTeam: new Map(),
  players: new Map([[10, player()], [11, player({ playerId: 2, name: "Jarrett Allen", pos: "C", salary: 18 })]]),
  picks: new Map([[5, { year: 2027, round: 1, originalTeamName: "OKCC" }]]),
  dunkest: { stats: () => undefined, injured: () => false },
  ...over,
});

const twoTeams = {
  teams: ["a", "b"],
  moves: [
    { kind: "contract", id: 11, from: "b", to: "a" },
    { kind: "contract", id: 10, from: "a", to: "b", slot: "reserve" },
    { kind: "pick", id: 5, from: "a", to: "b" },
    { kind: "talent", id: 3, from: "b", to: "a", label: "M. Brown Jr.", draft_year: 2026 },
  ],
};

describe("tradeCardModel", () => {
  it("elenca per squadra ciò che riceve, con ruolo, stipendio e pick", () => {
    const m = tradeCardModel(input(twoTeams));
    expect(m?.teams.map((t) => t.name)).toEqual(["OKCC", "Chicago Spaccinos"]);
    expect(m?.teams[0].items).toEqual([
      { kind: "player", label: "Jarrett Allen", detail: "18 cr", pos: "C" },
      { kind: "talent", label: "M. Brown Jr.", detail: "diritti · draft 2026", pos: null },
    ]);
    expect(m?.teams[1].items).toEqual([
      { kind: "player", label: "Jalen Williams", detail: "24 cr · riserva", pos: "G" },
      { kind: "pick", label: "Pick 2027 · 1° giro", detail: "di OKCC", pos: null },
    ]);
    expect(m?.id).toBe(7);
  });

  it("scrive la data in italiano e segnala l'eccezione al cap", () => {
    const m = tradeCardModel({ ...input(twoTeams), trade: { id: 7, createdAt: "2026-10-29T10:00:00Z", capOverrideReason: "ok del moderatore", view: parseTrade(twoTeams) } });
    expect(m?.dateLabel).toBe("29 ott");
    expect(m?.capOverride).toBe(true);
  });

  it("dà la battuta del bot, sempre la stessa per lo stesso scambio, senza emoji", () => {
    const a = tradeCardModel(input(twoTeams));
    const b = tradeCardModel(input(twoTeams));
    expect(a?.quip).toBeTruthy();
    expect(a?.quip).toBe(b?.quip);
    expect(a?.quip).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u);
  });

  it("senza dati sul contratto usa il nome salvato nello scambio", () => {
    const m = tradeCardModel(input({ teams: ["a", "b"], moves: [{ kind: "contract", id: 99, from: "a", to: "b", label: "Gary Trent" }, { kind: "pick", id: 5, from: "b", to: "a" }] }, { players: new Map() }));
    expect(m?.teams[1].items[0]).toMatchObject({ label: "Gary Trent", detail: "", pos: null });
  });

  it("negli scambi a più squadre accorcia gli elenchi lunghi", () => {
    const moves = Array.from({ length: 7 }, (_, i) => ({ kind: "pick", id: i + 1, from: "a", to: "b" }));
    const m = tradeCardModel(input({ teams: ["a", "b", "c"], moves: [...moves, { kind: "pick", id: 50, from: "b", to: "c" }] }, { picks: new Map() }));
    expect(m?.teams[1].items).toHaveLength(3);
    expect(m?.teams[1].more).toBe(4);
    expect(m?.teams[2].more).toBe(0);
  });

  it("uno scambio senza dettaglio (importato) non ha card", () => {
    expect(tradeCardModel(input({}))).toBeNull();
    expect(tradeCardModel(input({ teams: ["a", "b"], moves: [] }))).toBeNull();
  });
});
