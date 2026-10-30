// Proposte per collegare i talenti (R-35) ai giocatori del listone: i nomi della squadra talenti vengono dal foglio e sono
// abbreviati ("T.Johnson", "Mel. Thomas", "Acuff jr", "Holmes II"). Pura e testata; la scelta finale resta all'admin,
// perché un cognome unico può essere un omonimo (un veterano al posto del rookie).
import type { PlayerListItem } from "./players";

const SUFFIX = /^(jr|sr|ii|iii|iv)$/i;
const letters = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Iniziale o prefisso del nome (prima del punto) e cognome ridotto a lettere, senza anno di draft né suffissi. */
export function talentNameParts(name: string): { prefix: string; last: string } {
  const clean = name.replace(/[\d()?]+/g, " ").trim();
  const dot = clean.indexOf(".");
  const prefix = dot > 0 ? letters(clean.slice(0, dot)) : "";
  const rest = (dot > 0 ? clean.slice(dot + 1) : clean).split(/[\s.]+/).filter((w) => w && !SUFFIX.test(w));
  return { prefix, last: letters(rest.join("")) };
}

/** Cognome del listone senza suffissi ("Brown Jr." → "brown"), ridotto a lettere. */
const playerLast = (p: PlayerListItem) => {
  const words = p.name.split(/\s+/).filter((w) => w && !SUFFIX.test(w.replace(/\./g, "")));
  return words.slice(1).join("");
};

/**
 * Giocatori del listone compatibili con il nome del talento: cognome uguale e, se c'è, nome che inizia col prefisso.
 * Esclude chi ha un contratto e chi è già collegato a un altro talento (`taken`). Il cognome si confronta sia con
 * l'ultima parola sia con tutto ciò che segue il nome, così "De Larrea" e "Kaufman-renn" trovano il giocatore.
 */
export function talentCandidates(name: string, players: readonly PlayerListItem[], taken: ReadonlySet<number> = new Set()): PlayerListItem[] {
  const { prefix, last } = talentNameParts(name);
  if (!last) return [];
  return players.filter((p) => {
    if (p.ownerTeamId || taken.has(p.id)) return false;
    const words = p.name.split(/\s+/).filter((w) => w && !SUFFIX.test(w.replace(/\./g, "")));
    if (words.length === 0) return false;
    const lastWord = letters(words[words.length - 1]);
    const lastFull = letters(playerLast(p));
    if (last !== lastWord && last !== lastFull) return false;
    return prefix === "" || letters(words[0]).startsWith(prefix);
  });
}
