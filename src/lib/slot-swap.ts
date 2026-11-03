import { evaluateSlotSwap, type Position, type SlotSwapEvaluation } from "./cap";
import { teamSide, type LeagueView, type Versions } from "./league";

/**
 * Richieste di cambio titolari ↔ riserve (R-04, docs/product/PIANO-CAMBI-RISERVE.md): righe di `slot_swap_requests` lette con
 * RLS (la squadra della richiesta e gli admin). Nessuna regola di lega qui: l'esito è sempre `evaluateSlotSwap` di cap.ts.
 */
export type SlotSwapStatus = "pending" | "approved" | "declined" | "withdrawn";
export type SwapSlot = "starter" | "reserve";

export interface SlotSwapItem {
  /** id del contratto */
  id: number;
  version: number;
  /** dove va il giocatore */
  slot: SwapSlot;
  /** nome al momento dell'invio (resta nello storico se il giocatore viene poi tagliato o scambiato) */
  label?: string;
}

export interface SlotSwapRequest {
  id: number;
  version: number;
  teamId: string;
  status: SlotSwapStatus;
  items: SlotSwapItem[];
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

/** Riga come la legge `loadSlotSwaps`. */
export interface SlotSwapRow {
  id: number;
  version: number;
  team_id: string;
  status: SlotSwapStatus;
  items: unknown;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

/** Giocatori salvati (`items jsonb`, formato di `admin_swap_slots`); quelli malformati si scartano. */
export function parseSlotSwapItems(json: unknown): SlotSwapItem[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x): SlotSwapItem[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "number" || typeof o.version !== "number" || (o.slot !== "starter" && o.slot !== "reserve")) return [];
    return [{ id: o.id, version: o.version, slot: o.slot, ...(typeof o.label === "string" && o.label ? { label: o.label } : {}) }];
  });
}

export function toSlotSwap(r: SlotSwapRow): SlotSwapRequest {
  return {
    id: r.id,
    version: r.version,
    teamId: r.team_id,
    status: r.status,
    items: parseSlotSwapItems(r.items),
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  };
}

export interface SlotSwapCheck {
  ev: SlotSwapEvaluation;
  /** giocatori non più nella squadra o cambiati dopo l'invio (versione diversa): la richiesta va rifatta */
  stale: SlotSwapItem[];
}

/** Valuta una richiesta sulla rosa di adesso. Senza `versions` non controlla le versioni (anteprima). null = squadra inesistente. */
export function evaluateSlotSwapItems(league: LeagueView, teamId: string, items: readonly SlotSwapItem[], versions?: Versions): SlotSwapCheck | null {
  const team = league.teams.find((t) => t.team.id === teamId);
  if (!team) return null;
  const ids = new Set([...team.starters, ...team.reserves].map((p) => p.id));
  const stale = items.filter((i) => !ids.has(i.id) || (versions !== undefined && versions.contracts[i.id] !== i.version));
  return { ev: evaluateSlotSwap(teamSide(team), new Map(items.map((i) => [i.id, i.slot])), league.settings), stale };
}

export interface SlotSwapLine {
  id: number;
  name: string;
  pos: Position | null;
  /** null = giocatore non più nella squadra (si mostra l'etichetta salvata) */
  salary: number | null;
  slot: SwapSlot;
}

/** Chi sale e chi scende, coi dati di adesso della squadra (o l'etichetta salvata se il giocatore non c'è più). */
export function slotSwapLines(league: LeagueView, teamId: string, items: readonly SlotSwapItem[]): { up: SlotSwapLine[]; down: SlotSwapLine[] } {
  const team = league.teams.find((t) => t.team.id === teamId);
  const players = new Map([...(team?.starters ?? []), ...(team?.reserves ?? [])].map((p) => [p.id, p]));
  const lines = items.map((i): SlotSwapLine => {
    const p = players.get(i.id);
    return { id: i.id, name: p?.name ?? i.label ?? "?", pos: p?.pos ?? null, salary: p?.salary ?? null, slot: i.slot };
  });
  return { up: lines.filter((l) => l.slot === "starter"), down: lines.filter((l) => l.slot === "reserve") };
}

/** Nome del giocatore da salvare con la richiesta. */
export function slotSwapLabel(league: LeagueView, teamId: string, id: number): string | undefined {
  const team = league.teams.find((t) => t.team.id === teamId);
  return [...(team?.starters ?? []), ...(team?.reserves ?? [])].find((p) => p.id === id)?.name;
}

/** Richieste in attesa dell'admin (per il badge e la coda). */
export const pendingSwaps = (list: readonly SlotSwapRequest[]) => list.filter((r) => r.status === "pending");
