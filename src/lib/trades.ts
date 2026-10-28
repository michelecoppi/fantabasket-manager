/**
 * Storico scambi: legge `trades.payload` come lo scrive `admin_execute_trade`. Formato attuale (scambi a 2+ squadre):
 * `{ teams: [uuid...], moves: [{ kind, id, version, from, to, slot?, label? }] }`. Formato vecchio (solo due squadre):
 * `{ team_a, team_b, a_gives: { contracts, picks }, b_gives }`, convertito negli stessi movimenti.
 */
export interface TradeMove {
  kind: "contract" | "pick";
  id: number;
  from: string;
  to: string;
  label?: string;
  /** slot di arrivo, solo se il giocatore è cambiato di slot nello scambio */
  slot?: "starter" | "reserve";
}
export interface TradeView {
  /** squadre nell'ordine in cui sono state scelte */
  teams: string[];
  moves: TradeMove[];
  /** false per gli scambi importati o con payload vuoto: si mostra solo data e stato */
  complete: boolean;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const slotOf = (v: unknown) => (v === "starter" || v === "reserve" ? v : undefined);

function asMove(x: unknown, fallback?: { kind: TradeMove["kind"]; from: string; to: string }): TradeMove[] {
  if (!x || typeof x !== "object") return [];
  const o = x as Record<string, unknown>;
  const kind = fallback?.kind ?? (o.kind === "contract" || o.kind === "pick" ? o.kind : undefined);
  const from = fallback?.from ?? str(o.from);
  const to = fallback?.to ?? str(o.to);
  if (typeof o.id !== "number" || !kind || !from || !to) return [];
  return [{ kind, id: o.id, from, to, label: str(o.label), slot: kind === "contract" ? slotOf(o.slot) : undefined }];
}

/** Movimenti del formato vecchio: ciò che `from` cede va tutto a `to`. */
function legacyMoves(gives: unknown, from: string, to: string): TradeMove[] {
  const o = gives && typeof gives === "object" ? (gives as { contracts?: unknown; picks?: unknown }) : {};
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return [
    ...list(o.contracts).flatMap((x) => asMove(x, { kind: "contract", from, to })),
    ...list(o.picks).flatMap((x) => asMove(x, { kind: "pick", from, to })),
  ];
}

export function parseTrade(payload: unknown): TradeView {
  const o = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  let teams: string[];
  let moves: TradeMove[];
  if (Array.isArray(o.teams)) {
    teams = o.teams.filter((t): t is string => typeof t === "string" && !!t);
    moves = (Array.isArray(o.moves) ? o.moves : []).flatMap((x) => asMove(x)).filter((m) => teams.includes(m.from) && teams.includes(m.to));
  } else {
    const a = str(o.team_a);
    const b = str(o.team_b);
    teams = a && b ? [a, b] : [];
    moves = a && b ? [...legacyMoves(o.a_gives, a, b), ...legacyMoves(o.b_gives, b, a)] : [];
  }
  return { teams, moves, complete: teams.length >= 2 && moves.length > 0 };
}

/** Campi di audit_log mostrati in forma leggibile nel registro admin. */
const FIELD_LABELS: Record<string, string> = {
  team_id: "Squadra",
  current_team_id: "Proprietario",
  salary: "Stipendio",
  slot: "Slot",
  years_left: "Anni rimasti",
  team_option: "Team option",
  is_rookie: "Rookie",
  restriction: "Restrizione",
  paid_salary: "Quota pagata",
  status: "Stato",
  bonus: "Bonus",
  entry_fee_paid: "Iscrizione pagata",
  luxury_tax_paid: "Luxury tax pagata",
};

export function auditChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { field: string; before: string; after: string }[] {
  const fmt = (v: unknown) => (v === undefined || v === null ? "–" : typeof v === "boolean" ? (v ? "sì" : "no") : String(v));
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => k !== "summary");
  return keys
    .map((k) => ({ field: FIELD_LABELS[k] ?? k, before: fmt(before?.[k]), after: fmt(after?.[k]) }))
    .filter((c) => c.before !== c.after);
}
