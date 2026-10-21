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
};

export const auditLabel = (action: string) => AUDIT_ACTIONS[action] ?? action;

export interface AuditRow {
  id: number;
  at: string;
  action: string;
  after: { summary?: string; cap_override_reason?: string | null } | null;
}
