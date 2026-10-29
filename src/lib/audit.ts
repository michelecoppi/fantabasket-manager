/** Etichette delle operazioni scritte da `audit_write` nelle RPC admin (migrazioni 0006-0007). */
export const AUDIT_ACTIONS: Record<string, string> = {
  sign: "Firma",
  update: "Modifica",
  remove: "Rimozione",
  cut: "Taglio",
  finalize_cut: "Taglio definitivo",
  reinstate: "Rientro",
  award: "Asta tagliati",
  trade: "Scambio",
  pick: "Pick",
  picks_open: "Nuovo draft",
  season: "Quote e tasse",
  close_season: "Chiusura stagione",
  market: "Mercato",
  trade_proposal: "Proposta",
};

export const auditLabel = (action: string) => AUDIT_ACTIONS[action] ?? action;

export interface AuditRow {
  id: number;
  at: string;
  action: string;
  user_id: string | null;
  after: { summary?: string; cap_override_reason?: string | null } | null;
}

/** Riga di dettaglio di una transazione (stesso `at` della riga di riepilogo): una per contratto, pick o cut toccati. */
export interface AuditDetail {
  at: string;
  user_id: string | null;
  table_name: string;
  row_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export const TABLE_LABELS: Record<string, string> = {
  contracts: "Contratto",
  cuts: "Taglio",
  draft_picks: "Pick",
  team_season: "Quote squadra",
  trades: "Scambio",
  seasons: "Stagione",
};
