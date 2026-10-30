import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S, evaluateTrade } from "./cap";
import {
  addTeam,
  decodeMoves,
  draftFromMoves,
  draftKey,
  draftMoves,
  emptyDraft,
  encodeMoves,
  nextTeam,
  removeTeam,
  setArrivalSlot,
  setDestination,
  staleMoves,
  togglePick,
  togglePlayer,
  toggleTalent,
  toParties,
  tradeInputError,
  type SimTeam,
  type TradeMoveInput,
} from "./trade-draft";

const team = (id: string, playerId: number, salary: number, pickId?: number): SimTeam => ({
  id,
  name: id.toUpperCase(),
  bonus: 0,
  cuts: [],
  players: [{ id: playerId, name: `P${playerId}`, pos: "G", slot: "starter", salary, version: 1 }],
  picks: pickId ? [{ id: pickId, year: 2027, round: 1, toConfirm: false, label: "2027 · 1° giro", version: 3 }] : [],
});
const teams = [team("a", 1, 30, 10), team("b", 2, 20), team("c", 3, 10)];

describe("bozza di scambio (R-56)", () => {
  it("propone come destinazione la squadra successiva, a giro", () => {
    expect(nextTeam(["a", "b", "c"], "a")).toBe("b");
    expect(nextTeam(["a", "b", "c"], "c")).toBe("a");
    expect(nextTeam(["a"], "a")).toBeUndefined();
  });

  it("con una sola squadra non si cede nulla", () => {
    expect(togglePlayer(emptyDraft(["a"]), "a", 1).players.size).toBe(0);
  });

  it("selezione, destinazione e slot finiscono nelle squadre di evaluateTrade", () => {
    let d = addTeam(emptyDraft(["a", "b"]), "c", S.tradeMaxTeams);
    d = togglePlayer(d, "a", 1);
    d = setDestination(d, "players", 1, "c");
    d = setArrivalSlot(d, 1, "reserve", "starter");
    d = togglePlayer(d, "c", 3);
    d = togglePick(d, "a", 10);
    expect(d.players.get(3)?.to).toBe("a");
    expect(d.picks.get(10)?.to).toBe("b");
    const ev = evaluateTrade(toParties(teams, d), S);
    expect(ev.errors).toEqual([]);
    expect(ev.impacts.map((i) => i.after.payroll)).toEqual([10, 20, 0]);
    expect(ev.impacts[2].after.reserveSpace).toBe(S.reserveBudget - 30);
    expect(draftMoves(teams, d).map((m) => `${m.kind}:${m.id}:${m.from}>${m.to}:${m.slot ?? "-"}:${m.version}`)).toEqual([
      "contract:1:a>c:reserve:1",
      "contract:3:c>a:-:1",
      "pick:10:a>b:-:3",
    ]);
  });

  it("non manda nulla alla squadra che cede né fuori dallo scambio", () => {
    const d = togglePlayer(emptyDraft(["a", "b", "c"]), "a", 1);
    expect(setDestination(d, "players", 1, "a")).toBe(d);
    expect(setDestination(d, "players", 1, "z")).toBe(d);
  });

  it("scegliere lo slot che il giocatore ha già equivale a non scegliere", () => {
    const d = setArrivalSlot(togglePlayer(emptyDraft(["a", "b"]), "a", 1), 1, "starter", "starter");
    expect(d.players.get(1)).toEqual({ from: "a", to: "b" });
  });

  it("togliendo una squadra spariscono le sue cessioni e ciò che riceveva cambia destinazione", () => {
    let d = emptyDraft(["a", "b", "c"]);
    d = togglePlayer(d, "a", 1);
    d = setDestination(d, "players", 1, "c");
    d = togglePlayer(d, "c", 3);
    d = removeTeam(d, "c");
    expect(d.teams).toEqual(["a", "b"]);
    expect([...d.players]).toEqual([[1, { from: "a", to: "b" }]]);
  });

  it("rispetta il massimo di squadre e non aggiunge doppioni", () => {
    const d = emptyDraft(["a", "b"]);
    expect(addTeam(d, "c", 2)).toBe(d);
    expect(addTeam(d, "a", 4)).toBe(d);
  });

  it("la firma cambia a ogni modifica", () => {
    const d = emptyDraft(["a", "b"]);
    expect(draftKey(togglePlayer(d, "a", 1))).not.toBe(draftKey(d));
  });
});

describe("movimenti salvati (proposte, Fase 7)", () => {
  const moves: TradeMoveInput[] = [
    { kind: "contract", id: 1, version: 1, from: "a", to: "c", slot: "reserve" },
    { kind: "contract", id: 3, version: 1, from: "c", to: "a" },
    { kind: "pick", id: 10, version: 3, from: "a", to: "b" },
  ];

  it("ricostruisce la bozza: stessi movimenti e stesso esito del simulatore", () => {
    const d = draftFromMoves(["a", "b", "c"], moves);
    expect(draftMoves(teams, d).map(({ kind, id, version, from, to, slot }) => ({ kind, id, version, from, to, ...(slot ? { slot } : {}) }))).toEqual(moves);
    expect(evaluateTrade(toParties(teams, d), S).impacts.map((i) => i.after.payroll)).toEqual([10, 20, 0]);
  });

  it("trova i movimenti che non valgono più: proprietario o versione cambiati", () => {
    expect(staleMoves(teams, moves)).toEqual([]);
    const moved = [team("a", 1, 30, 10), team("b", 2, 20), team("c", 4, 10)];
    expect(staleMoves(moved, moves).map((m) => m.id)).toEqual([3]);
    const renewed: SimTeam[] = teams.map((t) => (t.id === "a" ? { ...t, players: t.players.map((p) => ({ ...p, version: 2 })) } : t));
    expect(staleMoves(renewed, moves).map((m) => m.id)).toEqual([1]);
    // senza versioni (simulatore pubblico) conta solo il proprietario
    const noVersions: SimTeam[] = teams.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p, version: undefined })) }));
    expect(staleMoves(noVersions, [{ ...moves[0], version: 99 }])).toEqual([]);
  });

  it("rifiuta movimenti malformati arrivati da un client", () => {
    expect(tradeInputError(["a", "b"], [moves[2]])).toBeNull();
    expect(tradeInputError(["a", "b"], [{ ...moves[2], to: "a" }])).not.toBeNull();
    expect(tradeInputError(["a", "b"], [{ ...moves[2], to: "z" }])).not.toBeNull();
    expect(tradeInputError(["a", "b"], [{ ...moves[2], slot: "starter" }])).not.toBeNull();
    expect(tradeInputError(["a", "b"], [{ ...moves[2], version: Number.NaN }])).not.toBeNull();
    expect(tradeInputError("a", [])).not.toBeNull();
    expect(tradeInputError(["a", "b"], [null])).not.toBeNull();
  });
});

describe("diritti dei talenti negli scambi (R-56, R-35, 7.6)", () => {
  const talent = (id: number, name: string, version = 1) => ({ id, name, draftYear: 2026, credits: 3.5, nbaTeam: "DAL", version });
  const withTalents: SimTeam[] = [
    { ...team("a", 1, 30, 10), talents: [talent(51, "Flagg"), talent(52, "Estero")] },
    { ...team("b", 2, 20), talents: [talent(61, "Harper")] },
    team("c", 3, 10),
  ];
  const ev = (d: ReturnType<typeof emptyDraft>) => evaluateTrade(toParties(withTalents, d), S);

  it("scambio di soli talenti: in regola, nessun effetto su cap e riserve", () => {
    let d = toggleTalent(emptyDraft(["a", "b"]), "a", 51);
    d = toggleTalent(d, "b", 61);
    const r = ev(d);
    expect(r.errors).toEqual([]);
    expect(r.capBreakers).toEqual([]);
    for (const i of r.impacts) {
      expect(i.after.payroll).toBe(i.before.payroll);
      expect(i.after.reserveSpace).toBe(i.before.reserveSpace);
    }
    expect(draftMoves(withTalents, d).map((m) => `${m.kind}:${m.id}:${m.from}>${m.to}:${m.version}:${m.label}`)).toEqual([
      "talent:51:a>b:1:Flagg",
      "talent:61:b>a:1:Harper",
    ]);
  });

  it("un talento per niente: chi lo riceve partecipa, chi non cede né riceve blocca", () => {
    const d = toggleTalent(emptyDraft(["a", "b"]), "a", 52);
    expect(ev(d).errors).toEqual([]);
    const three = toggleTalent(emptyDraft(["a", "b", "c"]), "a", 52);
    expect(ev(three).errors).toEqual(["C: non cede e non riceve nulla."]);
    expect(ev(setDestination(three, "talents", 52, "c")).errors).toEqual(["B: non cede e non riceve nulla."]);
  });

  it("talento contro titolare: il cap si muove solo per il giocatore", () => {
    let d = toggleTalent(emptyDraft(["a", "b"]), "a", 51);
    d = togglePlayer(d, "b", 2);
    const r = ev(d);
    expect(r.errors).toEqual([]);
    expect(r.impacts.map((i) => i.after.payroll)).toEqual([50, 0]);
    expect(draftMoves(withTalents, d).map((m) => m.kind)).toEqual(["contract", "talent"]);
  });

  it("talento che non è di chi lo cede, o verso una squadra fuori dallo scambio", () => {
    const parties = toParties(withTalents, emptyDraft(["a", "b"]));
    const notMine = parties.map((p) => (p.id === "b" ? { ...p, gives: { ...p.gives, talents: new Set([51]) } } : p));
    expect(evaluateTrade(notMine, S).errors).toContain("Un talento ceduto non appartiene a B.");
    const outside = parties.map((p) =>
      p.id === "a" ? { ...p, gives: { ...p.gives, talents: new Set([51]), to: { talents: new Map([[51, "z"]]) } } } : p,
    );
    expect(evaluateTrade(outside, S).errors).toContain("A: un talento va a una squadra che non è nello scambio.");
  });

  it("togliere una squadra toglie le sue cessioni e riassegna ciò che riceveva; la firma della bozza cambia", () => {
    let d = toggleTalent(emptyDraft(["a", "b", "c"]), "a", 51);
    d = setDestination(d, "talents", 51, "c");
    d = toggleTalent(d, "b", 61);
    expect(d.talents.get(61)?.to).toBe("c");
    const noC = removeTeam(d, "c");
    expect(noC.talents.get(51)?.to).toBe("b");
    expect(noC.talents.get(61)?.to).toBe("a");
    expect(removeTeam(d, "a").talents.has(51)).toBe(false);
    expect(draftKey(toggleTalent(emptyDraft(["a", "b"]), "a", 51))).not.toBe(draftKey(emptyDraft(["a", "b"])));
  });

  it("movimenti salvati: bozza, stale (firmato, scambiato, versione), forma e URL", () => {
    const moves: TradeMoveInput[] = [{ kind: "talent", id: 51, version: 1, from: "a", to: "b" }];
    expect(draftFromMoves(["a", "b"], moves).talents.get(51)).toEqual({ from: "a", to: "b" });
    expect(staleMoves(withTalents, moves)).toEqual([]);
    const signed = withTalents.map((t) => (t.id === "a" ? { ...t, talents: [] } : t));
    expect(staleMoves(signed, moves)).toHaveLength(1);
    expect(staleMoves(withTalents, [{ ...moves[0], version: 2 }])).toHaveLength(1);
    expect(staleMoves(withTalents, [{ ...moves[0], from: "b" }])).toHaveLength(1);
    expect(tradeInputError(["a", "b"], moves)).toBeNull();
    expect(tradeInputError(["a", "b"], [{ ...moves[0], slot: "reserve" }])).not.toBeNull();
    expect(encodeMoves(moves)).toBe("t51");
    expect(decodeMoves(withTalents, ["a", "b"], "t51,c2")).toEqual([
      { kind: "talent", id: 51, version: 1, from: "a", to: "b" },
      { kind: "contract", id: 2, version: 1, from: "b", to: "a" },
    ]);
    expect(decodeMoves(withTalents, ["a", "b"], "t51r")).toBeNull();
    expect(decodeMoves(withTalents, ["a", "c"], "t61")).toBeNull();
  });
});
