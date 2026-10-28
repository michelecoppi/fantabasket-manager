/** Storico scambi: legge `trades.payload` come lo scrive `admin_execute_trade` (id e versioni, più `label` per gli scambi nuovi). */
export interface TradeItem {
  id: number;
  label?: string;
  /** slot di arrivo, solo se il giocatore è cambiato di slot nello scambio */
  slot?: "starter" | "reserve";
}
export interface TradeSide {
  contracts: TradeItem[];
  picks: TradeItem[];
}
export interface TradeView {
  teamA: string | null;
  teamB: string | null;
  aGives: TradeSide;
  bGives: TradeSide;
  /** false per gli scambi importati o con payload vuoto: si mostra solo data e stato */
  complete: boolean;
}

const asItems = (v: unknown): TradeItem[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const { id, label, slot } = x as { id?: unknown; label?: unknown; slot?: unknown };
        return typeof id === "number"
          ? [{ id, label: typeof label === "string" && label ? label : undefined, slot: slot === "starter" || slot === "reserve" ? slot : undefined }]
          : [];
      })
    : [];

const asSide = (v: unknown): TradeSide => {
  const o = v && typeof v === "object" ? (v as { contracts?: unknown; picks?: unknown }) : {};
  return { contracts: asItems(o.contracts), picks: asItems(o.picks) };
};

export function parseTrade(payload: unknown): TradeView {
  const o = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const teamA = typeof o.team_a === "string" ? o.team_a : null;
  const teamB = typeof o.team_b === "string" ? o.team_b : null;
  const aGives = asSide(o.a_gives);
  const bGives = asSide(o.b_gives);
  const items = aGives.contracts.length + aGives.picks.length + bGives.contracts.length + bGives.picks.length;
  return { teamA, teamB, aGives, bGives, complete: !!teamA && !!teamB && items > 0 };
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
