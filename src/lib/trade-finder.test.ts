import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S, type Position } from "./cap";
import { decodeMoves, encodeMoves, type SimTeam } from "./trade-draft";
import { findTrades, subsets, type FinderInput } from "./trade-finder";

// Lega di prova come quella vera: 8 squadre, 13 titolari (5 G, 5 A, 3 C) e 4 riserve, monte sotto il cap di 250.
const POS: Position[] = ["G", "G", "G", "G", "G", "A", "A", "A", "A", "A", "C", "C", "C"];
const team = (n: number): SimTeam => ({
  id: `t${n}`,
  name: `Squadra ${n}`,
  bonus: 0,
  cuts: [],
  players: [
    ...POS.map((pos, i) => ({ id: n * 100 + i, name: `P${n * 100 + i}`, pos, slot: "starter" as const, salary: 8 + ((i * 7 + n * 3) % 20), version: 1 })),
    ...(["G", "A", "C", "A"] as Position[]).map((pos, i) => ({ id: n * 100 + 50 + i, name: `R${n * 100 + 50 + i}`, pos, slot: "reserve" as const, salary: 3 + ((i + n) % 6), version: 1 })),
  ],
  picks: [{ id: n * 10, year: 2027, round: 1, toConfirm: false, label: "2027 · 1° giro", version: 2 }],
});
const teams = Array.from({ length: 8 }, (_, i) => team(i + 1));
const pdk = Object.fromEntries(teams.flatMap((t) => t.players.map((p) => [p.id, Math.round(p.salary * 1.1 + (p.id % 9))])));
const base: Omit<FinderInput, "need"> = { teams, settings: S, me: "t1", counterpart: "t2", picks: false, pdk };
const payroll = (t: SimTeam) => t.players.filter((p) => p.slot === "starter").reduce((n, p) => n + p.salary, 0);

describe("cercatore di scambi (Fase 7.4)", () => {
  it("la lega di prova è sotto il cap", () => {
    for (const t of teams) expect(payroll(t)).toBeLessThanOrEqual(S.cap);
  });

  it("enumera i sottoinsiemi dal più piccolo", () => {
    expect([...subsets([1, 2, 3], 1, 2)]).toEqual([[1], [2], [3], [1, 2], [1, 3], [2, 3]]);
    expect([...subsets([1, 2], 0, 1)]).toEqual([[], [1], [2]]);
    expect([...subsets(Array.from({ length: 17 }, (_, i) => i), 1, 3)]).toHaveLength(17 + 136 + 680);
  });

  it("giocatore preciso: arriva sempre lui, scambi senza blocchi né sforamenti, al massimo 10", () => {
    const target = teams[1].players[2];
    const out = findTrades({ ...base, need: { kind: "player", contractId: target.id } });
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.length).toBeLessThanOrEqual(10);
    for (const r of out.results) {
      expect(r.moves.some((m) => m.kind === "contract" && m.id === target.id && m.to === "t1")).toBe(true);
      expect(r.ev.errors).toEqual([]);
      expect(r.ev.capBreakers).toEqual([]);
      expect(r.teams).toEqual(["t1", "t2"]);
      expect(r.pdkDiff).not.toBeNull();
    }
    // dal più equilibrato
    const imb = out.results.map((r) => Math.abs(r.pdkDiff ?? 0));
    expect(imb).toEqual([...imb].sort((a, b) => a - b));
  });

  it("giocatore preciso della tua squadra o inesistente: niente", () => {
    expect(findTrades({ ...base, need: { kind: "player", contractId: teams[0].players[0].id } }).results).toEqual([]);
    expect(findTrades({ ...base, need: { kind: "player", contractId: 99999 } }).results).toEqual([]);
  });

  it("ruolo: arriva un giocatore di quel ruolo, anche cercando in tutta la lega", () => {
    const out = findTrades({ ...base, counterpart: null, need: { kind: "role", pos: "C" } });
    expect(out.results.length).toBeGreaterThan(0);
    const byId = new Map(teams.flatMap((t) => t.players.map((p) => [p.id, p])));
    for (const r of out.results) expect(r.moves.some((m) => m.kind === "contract" && m.to === "t1" && byId.get(m.id)?.pos === "C")).toBe(true);
    expect(new Set(out.results.map((r) => r.teams[1])).size).toBeGreaterThan(1);
  });

  it("spazio nel cap: guadagno positivo, prima chi libera i crediti chiesti, poi dal più equilibrato", () => {
    const out = findTrades({ ...base, need: { kind: "cap", amount: 6 }, limit: 100 });
    expect(out.results.length).toBeGreaterThan(0);
    const gains = out.results.map((r) => r.gain);
    for (const g of gains) expect(g).toBeGreaterThan(0);
    const enough = gains.map((g) => g >= 6);
    expect(enough[0]).toBe(true);
    expect(enough).toEqual([...enough].sort((a, b) => Number(b) - Number(a)));
    const ok = out.results.filter((r) => r.gain >= 6 && !r.pdkPartial).map((r) => Math.abs(r.pdkDiff ?? 0));
    expect(ok).toEqual([...ok].sort((a, b) => a - b));
    // con una richiesta irraggiungibile: dal guadagno più grande
    const far = findTrades({ ...base, need: { kind: "cap", amount: 999 } }).results.map((r) => r.gain);
    expect(far).toEqual([...far].sort((a, b) => b - a));
    for (const r of out.results) expect(r.ev.impacts[0].after.capSpace - r.ev.impacts[0].before.capSpace).toBeCloseTo(r.gain);
  });

  it("spazio nelle riserve: guadagno positivo", () => {
    const out = findTrades({ ...base, need: { kind: "reserves", amount: 1 } });
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) expect(r.gain).toBeGreaterThan(0);
  });

  it("le pick entrano solo se richieste", () => {
    const need = { kind: "player" as const, contractId: teams[1].players[0].id };
    expect(findTrades({ ...base, need, limit: 100 }).results.some((r) => r.moves.some((m) => m.kind === "pick"))).toBe(false);
    const withPicks = findTrades({ ...base, need, picks: true, limit: 100 });
    expect(withPicks.results.some((r) => r.moves.some((m) => m.kind === "pick" && m.from === "t1" && m.version === 2))).toBe(true);
  });

  it("varietà: mai due risultati che cedono la stessa cosa", () => {
    const out = findTrades({ ...base, counterpart: null, need: { kind: "cap", amount: 5 }, limit: 50 });
    const gives = out.results.map((r) => r.moves.filter((m) => m.from === "t1").map((m) => `${m.kind}${m.id}`).sort().join());
    expect(new Set(gives).size).toBe(gives.length);
  });

  it("gli scambi con giocatori senza PDK vanno dopo quelli con il PDK di tutti", () => {
    const partial = { ...pdk };
    for (const p of teams[1].players.filter((x) => x.pos === "C")) delete partial[p.id];
    const out = findTrades({ ...base, counterpart: null, pdk: partial, need: { kind: "role", pos: "C" }, limit: 100 });
    const flags = out.results.map((r) => r.pdkPartial);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
    expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
  });

  it("senza dati Dunkest l'equilibrio è sugli stipendi", () => {
    const out = findTrades({ ...base, pdk: {}, need: { kind: "role", pos: "G" } });
    for (const r of out.results) expect(r.pdkDiff).toBeNull();
    const imb = out.results.map((r) => Math.abs(r.salaryDiff));
    expect(imb).toEqual([...imb].sort((a, b) => a - b));
  });

  it("si ferma al budget e lo dice", () => {
    const out = findTrades({ ...base, counterpart: null, need: { kind: "cap", amount: 5 }, budget: 50 });
    expect(out.truncated).toBe(true);
    expect(out.tried).toBe(50);
  });

  it("le ricerche più larghe restano sotto il budget e veloci", () => {
    for (const need of [{ kind: "role", pos: "A" }, { kind: "cap", amount: 5 }, { kind: "reserves", amount: 3 }] as const) {
      const t0 = performance.now();
      const out = findTrades({ ...base, counterpart: null, picks: true, need });
      const ms = performance.now() - t0;
      expect(out.truncated).toBe(false);
      expect(ms).toBeLessThan(5000);
    }
    const t0 = performance.now();
    const out = findTrades({ ...base, picks: true, need: { kind: "player", contractId: teams[1].players[7].id } });
    expect(out.truncated).toBe(false);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe("cercatore e talenti (7.6)", () => {
  it("non propone mai talenti, nemmeno se le squadre ne hanno (decisione dell'utente 2026-10-30)", () => {
    const withTalents = teams.map((t, i) => ({ ...t, talents: [{ id: 900 + i, name: `T${i}`, draftYear: 2026, credits: 2, nbaTeam: null, version: 1 }] }));
    for (const need of [{ kind: "cap" as const, amount: 5 }, { kind: "role" as const, pos: "C" as const }]) {
      const out = findTrades({ ...base, teams: withTalents, picks: true, need });
      expect(out.results.length).toBeGreaterThan(0);
      for (const r of out.results) expect(r.moves.every((m) => m.kind !== "talent")).toBe(true);
    }
  });
});

describe("bozza nell'URL («Usa questa»)", () => {
  it("andata e ritorno, con slot e versioni di adesso", () => {
    const moves = [
      { kind: "contract" as const, id: 101, version: 1, from: "t1", to: "t2", slot: "reserve" as const },
      { kind: "contract" as const, id: 205, version: 1, from: "t2", to: "t1" },
      { kind: "pick" as const, id: 10, version: 2, from: "t1", to: "t2" },
    ];
    const code = encodeMoves(moves);
    expect(code).toBe("c101r,c205,p10");
    expect(decodeMoves(teams, ["t1", "t2"], code)).toEqual(moves);
  });

  it("rifiuta codici malformati, squadre sbagliate e pezzi di altri", () => {
    expect(decodeMoves(teams, ["t1"], "c101")).toBeNull();
    expect(decodeMoves(teams, ["t1", "t1"], "c101")).toBeNull();
    expect(decodeMoves(teams, ["t1", "zz"], "c101")).toBeNull();
    expect(decodeMoves(teams, ["t1", "t2"], "")).toBeNull();
    expect(decodeMoves(teams, ["t1", "t2"], "x1")).toBeNull();
    expect(decodeMoves(teams, ["t1", "t2"], "c301")).toBeNull(); // di t3
    expect(decodeMoves(teams, ["t1", "t2"], "p10r")).toBeNull();
    expect(decodeMoves(teams, ["t1", "t2"], "c101,c101")).toBeNull();
  });
});
