import type { TeamName } from "./names";

/**
 * Correzioni alle pick lette dal foglio. Chiave: "anno-giro-squadra originale" → squadra che la possiede.
 * `ChS` nel foglio = pick ceduta senza indicare a chi: la destinazione va scritta qui.
 */
export const PICK_OVERRIDES: Record<string, TeamName> = {
  // Foglio2: la pick #8 di Spaccinos è marcata "Da bol"
  "2026-1-Bol Bollerz": "Spaccinos",
};
