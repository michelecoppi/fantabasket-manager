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

/**
 * Un movimento come lo salvano scambi e proposte (`trades.payload`, `trade_proposals.moves`, RPC `admin_execute_trade` e
 * `trade_propose`): giocatore (id contratto) o pick, versione vista, chi cede, chi riceve, slot di arrivo facoltativo.
 */
export interface TradeMoveInput {
  kind: "contract" | "pick";
  id: number;
  version: number;
  from: string;
  to: string;
  slot?: ArrivalSlot;
}

/** Errore di forma dei movimenti arrivati da un client (le regole di lega sono altrove: `evaluateTrade`). */
export function tradeInputError(teams: unknown, moves: unknown): string | null {
  if (!Array.isArray(teams) || !Array.isArray(moves) || teams.some((t) => typeof t !== "string")) return "Dati non validi.";
  const ok = (moves as Partial<TradeMoveInput>[]).every(
    (m) =>
      !!m &&
      (m.kind === "contract" || m.kind === "pick") &&
      Number.isFinite(m.id) &&
      Number.isFinite(m.version) &&
      teams.includes(m.from) &&
      teams.includes(m.to) &&
      m.from !== m.to &&
      (m.slot === undefined || (m.kind === "contract" && (m.slot === "starter" || m.slot === "reserve"))),
  );
  return ok ? null : "Dati dello scambio non validi.";
}

/** Bozza che corrisponde a movimenti già salvati: serve a rivalutare una proposta e a ripartire da lei (controproposta). */
export function draftFromMoves(teams: readonly string[], moves: readonly TradeMoveInput[]): TradeDraft {
  const players = new Map<number, { from: string; to: string; slot?: ArrivalSlot }>();
  const picks = new Map<number, { from: string; to: string }>();
  for (const m of moves) {
    if (m.kind === "contract") players.set(m.id, { from: m.from, to: m.to, ...(m.slot ? { slot: m.slot } : {}) });
    else picks.set(m.id, { from: m.from, to: m.to });
  }
  return { teams: [...teams], players, picks };
}

/**
 * Movimenti che non valgono più: il giocatore o la pick non è più di chi lo cede, o la sua versione è cambiata (rinnovo,
 * spostamento, taglio). Senza versioni nelle squadre (`simTeams` senza `versions`) conta solo il proprietario.
 */
export function staleMoves(teams: readonly SimTeam[], moves: readonly TradeMoveInput[]): TradeMoveInput[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return moves.filter((m) => {
    const t = byId.get(m.from);
    const item = m.kind === "contract" ? t?.players.find((p) => p.id === m.id) : t?.picks.find((p) => p.id === m.id);
    return !item || (item.version !== undefined && item.version !== m.version);
  });
}

/**
 * Scambio a due squadre in un parametro d'URL (`?squadre=a,b&mosse=c12,c40r,p5`, «Usa questa» del cercatore): `c` contratto,
 * `p` pick, `r`/`s` slot di arrivo (riserva/titolare) se scelto. Chi cede e chi riceve si ricavano dalle rose di adesso.
 */
export function encodeMoves(moves: readonly TradeMoveInput[]): string {
  return moves.map((m) => `${m.kind === "contract" ? "c" : "p"}${m.id}${m.slot === "reserve" ? "r" : m.slot === "starter" ? "s" : ""}`).join(",");
}

/** Movimenti dal parametro d'URL, con le versioni di adesso; null se le squadre non sono due o un pezzo non è di nessuna delle due. */
export function decodeMoves(teams: readonly SimTeam[], teamIds: readonly string[], code: string): TradeMoveInput[] | null {
  if (teamIds.length !== 2 || teamIds[0] === teamIds[1]) return null;
  const pair = teamIds.map((id) => teams.find((t) => t.id === id));
  if (pair.some((t) => !t)) return null;
  const tokens = code.split(",").filter(Boolean);
  if (tokens.length === 0) return null;
  const out: TradeMoveInput[] = [];
  for (const tok of tokens) {
    const m = /^([cp])(\d+)([rs]?)$/.exec(tok);
    if (!m) return null;
    const id = Number(m[2]);
    const kind = m[1] === "c" ? "contract" : "pick";
    const fromIdx = pair.findIndex((t) => (kind === "contract" ? t!.players.some((p) => p.id === id) : t!.picks.some((p) => p.id === id)));
    if (fromIdx < 0 || (kind === "pick" && m[3])) return null;
    const from = pair[fromIdx]!;
    const item = kind === "contract" ? from.players.find((p) => p.id === id) : from.picks.find((p) => p.id === id);
    const slot = m[3] === "r" ? "reserve" : m[3] === "s" ? "starter" : undefined;
    out.push({ kind, id, version: item?.version ?? 0, from: from.id, to: pair[1 - fromIdx]!.id, ...(slot ? { slot } : {}) });
  }
  return new Set(out.map((m) => `${m.kind}${m.id}`)).size === out.length ? out : null;
}
