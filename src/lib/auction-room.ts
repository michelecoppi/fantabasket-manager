// Sala d'asta del playground (/asta, issue #104): stato e passaggi come reducer puro sopra le regole di `auction.ts`.
// Asta dei tagliati prima (R-50: lotti chiamati dall'app), poi chiamate a turno (R-51). L'admin mette in pausa, annulla l'ultima
// offerta, aggiudica subito e chiude l'asta quando vuole (decisione dell'utente 2026-11-02).
import {
  addSigning,
  advance,
  bidLimit,
  closeNow,
  declineRight,
  isLive,
  landingSlot,
  matchRight,
  nextCaller,
  openLot,
  pauseLot,
  placeBid,
  resumeLot,
  undoLastBid,
  type AuctionRules,
  type Lot,
} from "./auction";
import type { PlaygroundTeam, PoolEntry, Scenario } from "./auction-playground";
import type { LeagueSettings, Position } from "./cap";

export interface Sale {
  entry: PoolEntry;
  teamId: string;
  amount: number;
  matched: boolean;
  slot: "starter" | "reserve";
  bids: number;
  at: number;
}

export interface Room {
  rules: AuctionRules;
  settings: LeagueSettings;
  teams: PlaygroundTeam[];
  order: string[];
  pool: PoolEntry[];
  cutQueue: PoolEntry[];
  lot: Lot | null;
  entry: PoolEntry | null;
  /** cresce a ogni lotto: chiave per animazioni e bot */
  lotSeq: number;
  /** chi deve chiamare (null con un lotto in corso, o se nessuno può più chiamare) */
  caller: string | null;
  lastCaller: string | null;
  /** passaggi di fila: se passano tutti, l'asta è ferma e la chiude l'admin */
  passStreak: number;
  turnSince: number;
  /** quando il lotto si è chiuso (per lasciare il tempo di vedere «Aggiudicato») */
  settledAt: number | null;
  sales: Sale[];
  unsold: PoolEntry[];
  ended: boolean;
  startedAt: number;
  error: { teamId: string; text: string; at: number } | null;
}

export type RoomAction =
  | { type: "call"; teamId: string; playerId: number; amount: number; now: number }
  | { type: "pass"; teamId: string; now: number }
  | { type: "bid"; teamId: string; amount: number; now: number }
  | { type: "match" | "decline"; teamId: string; now: number }
  | { type: "tick" | "next" | "pause" | "resume" | "undo" | "close"; now: number }
  | { type: "end"; now: number };

const team = (room: Room, id: string) => room.teams.find((t) => t.id === id);

/** Quanto può offrire una squadra per un giocatore di quel ruolo, adesso. */
export function limitFor(room: Pick<Room, "teams" | "settings" | "rules">, teamId: string, pos: Position | null): number {
  const t = room.teams.find((x) => x.id === teamId);
  return t ? bidLimit(t.side, pos, room.settings, room.rules).max : 0;
}

/** Può chiamare chi ha ancora un posto e almeno un passo di spazio in qualche ruolo. */
export function canCall(room: Pick<Room, "teams" | "settings" | "rules">, teamId: string): boolean {
  return (["G", "A", "C"] as const).some((pos) => limitFor(room, teamId, pos) >= room.rules.step);
}

export function createRoom(sc: Scenario, settings: LeagueSettings, rules: AuctionRules, now: number): Room {
  const room: Room = {
    rules,
    settings,
    teams: sc.teams,
    order: sc.order,
    pool: sc.pool,
    cutQueue: sc.cutQueue,
    lot: null,
    entry: null,
    lotSeq: 0,
    caller: null,
    lastCaller: null,
    passStreak: 0,
    turnSince: now,
    settledAt: null,
    sales: [],
    unsold: [],
    ended: false,
    startedAt: now,
    error: null,
  };
  return nextLot(room, now);
}

/** Dopo un lotto: prima la coda dei tagliati, poi la squadra di turno. */
function nextLot(room: Room, now: number): Room {
  const base = { ...room, lot: null, entry: null, settledAt: null, error: null };
  const [cut, ...rest] = room.cutQueue;
  if (cut) {
    const lot = openLot({ player: cut.player, kind: cut.kind, formerTeamId: cut.formerTeamId, base: cut.base, calledBy: null, openingAmount: null }, now, room.rules);
    return { ...base, cutQueue: rest, lot, entry: cut, lotSeq: room.lotSeq + 1, caller: null };
  }
  const caller = room.passStreak >= room.order.length ? null : nextCaller(room.order, room.lastCaller, (id) => canCall(room, id));
  return { ...base, caller, turnSince: now };
}

/** Chiude il lotto se è finito: l'acquisto entra in rosa nello slot d'arrivo (`landingSlot`). */
function settleIfDone(room: Room, lot: Lot, now: number): Room {
  if (isLive(lot) || !room.entry) return { ...room, lot };
  if (lot.phase === "unsold" || !lot.result) return { ...room, lot, settledAt: now, unsold: [...room.unsold, room.entry] };
  const { teamId, amount, matched } = lot.result;
  const t = team(room, teamId);
  const pos = lot.player.pos;
  const slot = (t && landingSlot(t.side, pos, amount, room.settings, room.rules)) ?? "starter";
  const contractId = -(room.sales.length + 1);
  const teams = room.teams.map((x) => (x.id === teamId ? { ...x, side: addSigning(x.side, { position: pos, slot, salary: amount }, contractId) } : x));
  const sale: Sale = { entry: room.entry, teamId, amount, matched, slot, bids: lot.bids.length, at: now };
  return { ...room, lot, teams, settledAt: now, sales: [...room.sales, sale] };
}

const holderLimit = (room: Room, lot: Lot) => (lot.formerTeamId ? limitFor(room, lot.formerTeamId, lot.player.pos) : 0);

export function roomReducer(room: Room, a: RoomAction): Room {
  if (room.ended) return room;
  const lot = room.lot;
  switch (a.type) {
    case "call": {
      if (lot || room.caller !== a.teamId) return room;
      const entry = room.pool.find((p) => p.player.id === a.playerId);
      if (!entry) return room;
      const limit = limitFor(room, a.teamId, entry.player.pos);
      const holder = entry.kind === "restricted" && entry.formerTeamId === a.teamId;
      if (!holder && (limit < entry.base || a.amount > limit)) return { ...room, error: { teamId: a.teamId, text: "Non hai spazio per aprire a questa cifra.", at: a.now } };
      const opened = openLot(
        { player: entry.player, kind: entry.kind, formerTeamId: entry.formerTeamId, base: entry.base, calledBy: a.teamId, openingAmount: holder ? null : a.amount },
        a.now,
        room.rules,
      );
      return {
        ...room,
        pool: room.pool.filter((p) => p !== entry),
        lot: opened,
        entry,
        lotSeq: room.lotSeq + 1,
        caller: null,
        lastCaller: a.teamId,
        passStreak: 0,
        error: null,
      };
    }
    case "pass": {
      if (lot || room.caller !== a.teamId) return room;
      return nextLot({ ...room, lastCaller: a.teamId, passStreak: room.passStreak + 1 }, a.now);
    }
    case "bid": {
      if (!lot || !room.entry) return room;
      const { lot: next, errors } = placeBid(lot, a.teamId, a.amount, a.now, limitFor(room, a.teamId, lot.player.pos), room.rules);
      return errors.length ? { ...room, error: { teamId: a.teamId, text: errors[0], at: a.now } } : { ...room, lot: next, error: null };
    }
    case "tick":
      return lot && isLive(lot) ? settleIfDone(room, advance(lot, a.now, room.rules, holderLimit(room, lot)), a.now) : room;
    case "match":
      return lot ? settleIfDone(room, matchRight(lot, a.teamId), a.now) : room;
    case "decline":
      return lot ? settleIfDone(room, declineRight(lot, a.teamId), a.now) : room;
    case "next":
      return lot && isLive(lot) ? room : nextLot(room, a.now);
    case "pause":
      return lot ? { ...room, lot: pauseLot(lot, a.now) } : room;
    case "resume":
      return lot ? { ...room, lot: resumeLot(lot, a.now) } : room;
    case "undo":
      return lot ? { ...room, lot: undoLastBid(lot, a.now, room.rules) } : room;
    case "close":
      return lot ? settleIfDone(room, closeNow(lot, a.now, room.rules, holderLimit(room, lot)), a.now) : room;
    case "end": {
      // L'admin decreta la fine: un lotto ancora aperto va a chi è in testa, senza aprire il pareggio.
      const closed = lot && isLive(lot) ? settleIfDone(room, closeNow({ ...lot, kind: "free" }, a.now, room.rules), a.now) : room;
      return { ...closed, ended: true, caller: null };
    }
  }
}

/** Riepilogo per squadra: acquisti, spesa e spazio rimasto. */
export function teamSummary(room: Room, teamId: string) {
  const sales = room.sales.filter((s) => s.teamId === teamId);
  const t = team(room, teamId);
  return { sales, spent: Math.round(sales.reduce((n, s) => n + s.amount, 0) * 10) / 10, team: t };
}

