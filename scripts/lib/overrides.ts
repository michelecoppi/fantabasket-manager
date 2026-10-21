import type { TeamName } from "./names";

/**
 * Correzioni alle pick lette dal foglio. Chiave: "anno-giro-squadra originale" → squadra che la possiede.
 * `ChS` nel foglio = pick ceduta senza indicare a chi: la destinazione va scritta qui.
 */
export const PICK_OVERRIDES: Record<string, TeamName> = {
  // Foglio2: la pick #8 di Spaccinos è marcata "Da bol"
  "2026-1-Bol Bollerz": "Spaccinos",
};

/**
 * Pick con proprietario incerto (decisione utente 2026-10-21: "da confermare, poi si modifica").
 * Vengono importate con `to_confirm = true`; per `ChS` senza destinazione il proprietario resta vuoto.
 */
export const PICKS_TO_CONFIRM = new Set<string>([
  "2026-1-Bol Bollerz", // destinazione dedotta dal Foglio2
  "2026-1-OKCC", // Foglio1: Farmers, Foglio2: Spaccinos
  "2026-2-Assago Farmers", // ChS, destinatario sconosciuto
]);
