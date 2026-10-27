import type { TeamName } from "./names";

/**
 * Nomi del foglio che il solo cognome non risolve (abbreviazioni, refusi, soprannomi, omonimi).
 * Chiave: nome del foglio senza anni né sigle, ridotto a lettere minuscole (`lettersOnly`); valore: nome intero come
 * scritto da Dunkest, da cercare in scripts/data/dunkest-players.json. Vale per tutte le squadre.
 */
export const PLAYER_ALIASES: Record<string, string> = {
  // abbreviazioni e soprannomi
  mkbridges: "Mikal Bridges",
  mibridges: "Miles Bridges",
  giannis: "Giannis Antetokounmpo",
  sga: "Shai Gilgeous-Alexander",
  jjj: "Jaren Jackson Jr.",
  theking: "LeBron James",
  zion: "Zion Williamson",
  rwilliamsiii: "Robert Williams", // Dunkest non scrive "III"
  // refusi
  poetl: "Jakob Poeltl",
  withmore: "Cam Whitmore",
  hartestein: "Isaiah Hartenstein",
  kneuppel: "Kon Knueppel",
  cjonhson: "Cameron Johnson",
  murrayboyeles: "Collin Murray-Boyles",
  pallelarsson: "Pelle Larsson",
  russel: "D'Angelo Russell", // taglio Atlanto Non Vinco, unico Russell nello snapshot
  // omonimi risolti da ruolo e stipendio
  holiday: "Jrue Holiday", // Spaccinos, G da 11: Aaron Holiday (Houston) varrebbe molto meno
  jjohnson: "Jalen Johnson", // OKCC, A da 30
  thomas: "Cam Thomas", // confermato dall'utente 2026-10-23: unico Thomas dello snapshot, ma la sua squadra è del 2024-25
  bmiller: "Brandon Miller", // confermato dall'utente 2026-10-23: Baba Miller è nel listone dei free agent
  awalker: "Nickeil Alexander-Walker", // confermato dall'utente 2026-10-27 (Atlanta Hawks): finora restava provvisorio
  // ex contratti di giocatori ora nel listone dei free agent (il cognome da solo è ambiguo)
  anwiggins: "Andrew Wiggins",
  otoppin: "Obi Toppin",
};

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
