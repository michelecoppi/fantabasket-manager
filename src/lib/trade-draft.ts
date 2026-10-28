import type { PickInfo, Position, Slot, TradeParty } from "./cap";

/** Squadra nella forma che usano simulatore e scambio admin (`simTeams`); `version` solo per l'admin (concorrenza). */
export interface SimTeam {
  id: string;
  name: string;
  bonus: number;
  cuts: { salary: number }[];
  players: { id: number; name: string; pos: Position | null; slot: Slot; salary: number; version?: number }[];
  picks: (PickInfo & { label: string; version?: number })[];
}

/** Dove può arrivare un giocatore scambiato: la squadra talenti non si cambia. */
export type ArrivalSlot = Exclude<Slot, "talent">;

/**
 * Scambio in costruzione (R-56): squadre nell'ordine scelto e, per ogni giocatore (id contratto) o pick ceduto, chi lo cede e
 * chi lo riceve. Le funzioni qui sotto non mutano: restituiscono una bozza nuova.
 */
export interface TradeDraft {
  teams: string[];
  players: ReadonlyMap<number, { from: string; to: string; slot?: ArrivalSlot }>;
  picks: ReadonlyMap<number, { from: string; to: string }>;
}

export const emptyDraft = (teams: string[] = []): TradeDraft => ({ teams, players: new Map(), picks: new Map() });

/** Destinazione proposta per ciò che cede `from`: la squadra successiva nell'ordine, a giro (A → B → C → A). */
export function nextTeam(teams: readonly string[], from: string): string | undefined {
  if (teams.length < 2) return undefined;
  const i = teams.indexOf(from);
  return teams[(i + 1) % teams.length];
}

export function addTeam(d: TradeDraft, id: string, max: number): TradeDraft {
  if (d.teams.includes(id) || d.teams.length >= max) return d;
  return reassign({ ...d, teams: [...d.teams, id] });
}

/** Toglie una squadra: spariscono le sue cessioni, e ciò che doveva ricevere torna alla destinazione proposta. */
export function removeTeam(d: TradeDraft, id: string): TradeDraft {
  const keep = <T extends { from: string }>(m: ReadonlyMap<number, T>) => new Map([...m].filter(([, v]) => v.from !== id));
  return reassign({ teams: d.teams.filter((t) => t !== id), players: keep(d.players), picks: keep(d.picks) });
}

/** Con due squadre tutto va all'altra; destinazioni non più nello scambio tornano a quella proposta. */
function reassign(d: TradeDraft): TradeDraft {
  const fix = <T extends { from: string; to: string }>(m: ReadonlyMap<number, T>) =>
    new Map(
      [...m].flatMap(([k, v]) => {
        const valid = v.to !== v.from && d.teams.includes(v.to) && d.teams.length > 2;
        const to = valid ? v.to : nextTeam(d.teams, v.from);
        return to ? [[k, { ...v, to }] as const] : [];
      }),
    );
  return { teams: d.teams, players: fix(d.players), picks: fix(d.picks) };
}

export function togglePlayer(d: TradeDraft, from: string, id: number): TradeDraft {
  const players = new Map(d.players);
  const to = nextTeam(d.teams, from);
  if (!players.delete(id) && to) players.set(id, { from, to });
  return { ...d, players };
}

export function togglePick(d: TradeDraft, from: string, id: number): TradeDraft {
  const picks = new Map(d.picks);
  const to = nextTeam(d.teams, from);
  if (!picks.delete(id) && to) picks.set(id, { from, to });
  return { ...d, picks };
}

export function setDestination(d: TradeDraft, kind: "players" | "picks", id: number, to: string): TradeDraft {
  const cur = d[kind].get(id);
  if (!cur || to === cur.from || !d.teams.includes(to)) return d;
  return { ...d, [kind]: new Map(d[kind]).set(id, { ...cur, to }) };
}

/** Slot di arrivo; `null` o lo slot che il giocatore ha già = nessuna scelta (resta com'è). */
export function setArrivalSlot(d: TradeDraft, id: number, slot: ArrivalSlot | null, current: Slot): TradeDraft {
  const cur = d.players.get(id);
  if (!cur) return d;
  const next = { from: cur.from, to: cur.to, ...(slot && slot !== current ? { slot } : {}) };
  return { ...d, players: new Map(d.players).set(id, next) };
}

/** Le squadre della bozza nella forma di `evaluateTrade`. */
export function toParties(teams: readonly SimTeam[], d: TradeDraft): TradeParty[] {
  return d.teams.flatMap((id) => {
    const t = teams.find((x) => x.id === id);
    if (!t) return [];
    const players = [...d.players].filter(([, v]) => v.from === id);
    const picks = [...d.picks].filter(([, v]) => v.from === id);
    return [
      {
        id,
        name: t.name,
        side: { roster: t.players.map((p) => ({ id: p.id, position: p.pos, slot: p.slot, salary: p.salary })), cuts: t.cuts, bonus: t.bonus },
        picks: t.picks.map(({ id: pickId, year, round, toConfirm }) => ({ id: pickId, year, round, toConfirm })),
        gives: {
          contracts: new Set(players.map(([k]) => k)),
          picks: new Set(picks.map(([k]) => k)),
          slots: new Map(players.flatMap(([k, v]) => (v.slot ? [[k, v.slot] as const] : []))),
          to: { contracts: new Map(players.map(([k, v]) => [k, v.to])), picks: new Map(picks.map(([k, v]) => [k, v.to])) },
        },
      },
    ];
  });
}

export interface DraftMove {
  kind: "contract" | "pick";
  id: number;
  from: string;
  to: string;
  slot?: ArrivalSlot;
  /** dati per la UI */
  label: string;
  pos?: Position | null;
  salary?: number;
  version: number;
}

/** Tutti i movimenti della bozza, giocatori prima delle pick, nell'ordine delle squadre. */
export function draftMoves(teams: readonly SimTeam[], d: TradeDraft): DraftMove[] {
  const out: DraftMove[] = [];
  for (const id of d.teams) {
    const t = teams.find((x) => x.id === id);
    if (!t) continue;
    for (const p of t.players) {
      const m = d.players.get(p.id);
      if (m?.from === id) out.push({ kind: "contract", id: p.id, from: id, to: m.to, slot: m.slot, label: p.name, pos: p.pos, salary: p.salary, version: p.version ?? 0 });
    }
  }
  for (const id of d.teams) {
    const t = teams.find((x) => x.id === id);
    for (const p of t?.picks ?? []) {
      const m = d.picks.get(p.id);
      if (m?.from === id) out.push({ kind: "pick", id: p.id, from: id, to: m.to, label: p.label, version: p.version ?? 0 });
    }
  }
  return out;
}

/** Firma stabile della bozza: cambia a ogni modifica (serve a invalidare conferme e messaggi). */
export const draftKey = (d: TradeDraft) =>
  JSON.stringify([d.teams, [...d.players].sort((a, b) => a[0] - b[0]), [...d.picks].sort((a, b) => a[0] - b[0])]);
