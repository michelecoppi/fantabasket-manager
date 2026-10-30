// Card da condividere (immagini 1200×630 per Telegram, WhatsApp, Stories): qui il modello dei dati, puro e testato; il disegno è in
// `components/card-mvp.tsx` e la route in `app/card/mvp/[matchday]/route.tsx`. Solo presentazione dei premi già calcolati
// (`matchdayAwards`): nessuna regola di lega, nessun punteggio ricostruito.
import { AWARD_ORDER, matchdayAwards, type Award, type AwardKind, type AwardWinner } from "./awards";
import type { Position } from "./cap";
import type { LeagueMatch, LineupPlayer } from "./dunkest-league";

export interface CardTeam {
  name: string;
  color: string;
}

export interface MvpRunnerUp {
  /** «L. Dončić» */
  name: string;
  teamName: string;
  pts: number;
}

export interface MvpCardModel {
  matchday: number;
  /** giornata con punti ma non dichiarata chiusa (Dunkest non lo dice): la card lo scrive */
  provisional: boolean;
  /** nome diviso per il titolo a due righe; `first` vuoto se il nome è una parola sola */
  first: string;
  last: string;
  teamName: string;
  teamColor: string;
  pts: number;
  position: string | null;
  role: string;
  /** altri giocatori a pari punti (premio condiviso) */
  tiedWith: string[];
  runnersUp: MvpRunnerUp[];
}

const POSITION: Record<Position, string> = { G: "Guardia", A: "Ala", C: "Centro" };

/** «Nikola Jokić» → { first: "Nikola", last: "Jokić" }; «Jokić» → { first: "", last: "Jokić" }. */
export function splitName(name: string): { first: string; last: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first: "", last: words[0] ?? "" };
  return { first: words[0], last: words.slice(1).join(" ") };
}

/** «Luka Dončić» → «L. Dončić»; una parola sola resta com'è. */
export function shortName(name: string): string {
  const { first, last } = splitName(name);
  return first ? `${first[0]}. ${last}` : last;
}

const roleLabel = (p: LineupPlayer) => (p.isCaptain ? "Capitano" : p.isSixthMan ? "Sesto uomo" : p.role === "bench" ? "Panchina" : "In quintetto");

const cents = (n: number) => Math.round(n * 100);

/**
 * Modello della card MVP di una giornata, o null se non c'è un MVP (formazioni non salvate). Il vincitore è quello del premio
 * «mvp» di `matchdayAwards`; a pari punti gli altri vanno in `tiedWith`. I tre dietro sono i migliori giocatori rimasti, per punti.
 */
export function mvpCardModel(input: {
  matchday: number;
  provisional: boolean;
  matches: LeagueMatch[];
  lineups: Map<number, Map<string, LineupPlayer[]>>;
  teams: Map<string, CardTeam>;
}): MvpCardModel | null {
  const { matchday, provisional, matches, lineups, teams } = input;
  const mvp = matchdayAwards(matches, lineups).find((a) => a.kind === "mvp");
  if (!mvp || mvp.winners.length === 0) return null;

  const all = matches.flatMap((m) =>
    [...(lineups.get(m.id) ?? new Map<string, LineupPlayer[]>()).entries()].flatMap(([teamId, list]) =>
      list.filter((p): p is LineupPlayer & { pts: number } => p.pts !== null).map((p) => ({ teamId, p })),
    ),
  );
  const [win, ...others] = mvp.winners;
  const winner = all.find((x) => x.teamId === win.teamId && x.p.name === win.name && cents(x.p.pts) === cents(win.value));
  const teamOf = (id: string): CardTeam => teams.get(id) ?? { name: "?", color: "#1d47b5" };
  const isWinner = (x: (typeof all)[number]) => mvp.winners.some((w) => w.teamId === x.teamId && w.name === x.p.name);

  const { first, last } = splitName(win.name ?? "");
  return {
    matchday,
    provisional,
    first,
    last,
    teamName: teamOf(win.teamId).name,
    teamColor: teamOf(win.teamId).color,
    pts: win.value,
    position: winner?.p.pos ? POSITION[winner.p.pos] : null,
    role: winner ? roleLabel(winner.p) : "In quintetto",
    tiedWith: others.map((w) => w.name ?? "").filter(Boolean),
    runnersUp: all
      .filter((x) => !isWinner(x))
      .sort((a, b) => b.p.pts - a.p.pts)
      .slice(0, 3)
      .map((x) => ({ name: shortName(x.p.name), teamName: teamOf(x.teamId).name, pts: x.p.pts })),
  };
}

/** Punti come li scrive Dunkest: intero e decimali (virgola) separati, così la card ingrandisce l'intero e rimpicciolisce i decimali. */
export function splitPoints(pts: number): { whole: string; decimals: string } {
  const [whole, decimals = ""] = (Math.round(pts * 100) / 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 2, useGrouping: false }).split(",");
  return { whole, decimals };
}

/** Punti sulla riga dei piazzamenti: «61,0», «72,19». */
export const cardPoints = (pts: number) => (Math.round(pts * 100) / 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 2, useGrouping: false });

// Larghezza in em delle lettere maiuscole di Big Shoulders Display 900 (advance dal file del font): la M e la W sono larghe
// il doppio della I, quindi un cognome si misura lettera per lettera, non con una media. Le lettere accentate valgono come la base.
const DISPLAY_EM: Record<string, number> = {
  A: 0.478, B: 0.472, C: 0.49, D: 0.495, E: 0.408, F: 0.406, G: 0.493, H: 0.485, I: 0.23, J: 0.453, K: 0.496, L: 0.402, M: 0.745,
  N: 0.543, O: 0.496, P: 0.47, Q: 0.496, R: 0.477, S: 0.474, T: 0.419, U: 0.487, V: 0.494, W: 0.8, X: 0.471, Y: 0.465, Z: 0.418,
  " ": 0.22, "-": 0.446, "'": 0.203, ".": 0.25,
};

/** Larghezza stimata in pixel di un testo maiuscolo in Big Shoulders 900 a `size` px con `letterSpacing` px tra le lettere. */
export function displayWidth(text: string, size: number, letterSpacing = 0): number {
  const base = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return [...base].reduce((sum, ch) => sum + (DISPLAY_EM[ch] ?? 0.48) * size + letterSpacing, 0);
}

/** Corpo più grande (fino a `maxSize`) con cui il testo sta in `maxWidth`; mai sotto `minSize`. */
export function fitDisplaySize(text: string, maxWidth: number, maxSize: number, minSize: number, letterSpacing = 0): number {
  const perPx = displayWidth(text, 1, 0);
  const fixed = [...text].length * letterSpacing;
  const size = perPx > 0 ? Math.floor((maxWidth - fixed) / perPx) : maxSize;
  return Math.max(minSize, Math.min(maxSize, size));
}

// ---------- Premi della giornata ----------

export interface AwardTileModel {
  kind: AwardKind;
  /** giocatore (premi individuali) o squadra vincitrice */
  title: string;
  /** squadra del giocatore, oppure «su CUS Cosenza» / «contro OKCC» per i premi di squadra e di scontro */
  subtitle: string;
  teamName: string;
  teamColor: string;
  value: number;
  /** vince un giocatore (non una squadra): il titolo si può abbreviare */
  player: boolean;
  /** premi di scarto (goleada, fotofinish): il valore si scrive con il + */
  margin: boolean;
  /** altri vincitori a pari valore (premio condiviso) */
  more: number;
}

export interface AwardsCardModel {
  matchday: number;
  provisional: boolean;
  /** la tessera grande: l'MVP, o la squadra della giornata se mancano le formazioni */
  hero: AwardTileModel;
  /** gli altri premi, nell'ordine della bacheca (`AWARD_ORDER`), al massimo `AWARD_TILES` */
  tiles: AwardTileModel[];
}

/** Tessere piccole che entrano nella card (2 colonne da 4). */
export const AWARD_TILES = 8;

const MARGIN_KINDS: AwardKind[] = ["blowout", "photo_finish"];

function awardTile(award: Award, teams: Map<string, CardTeam>): AwardTileModel {
  const w: AwardWinner = award.winners[0];
  const t = teams.get(w.teamId) ?? { name: "?", color: "#1d47b5" };
  const vs = w.vsTeamId ? (teams.get(w.vsTeamId)?.name ?? "?") : null;
  const margin = MARGIN_KINDS.includes(award.kind);
  let subtitle = "";
  if (w.name !== undefined) subtitle = t.name;
  else if (vs) subtitle = `${margin ? (w.value === 0 ? "pari con" : "su") : "contro"} ${vs}`;
  return { kind: award.kind, title: w.name ?? t.name, subtitle, teamName: t.name, teamColor: t.color, value: w.value, player: w.name !== undefined, margin, more: award.winners.length - 1 };
}

/** Modello della card dei premi di una giornata, o null se la giornata non ha premi (nessun punto). */
export function awardsCardModel(input: { matchday: number; provisional: boolean; awards: Award[]; teams: Map<string, CardTeam> }): AwardsCardModel | null {
  const sorted = [...input.awards].sort((a, b) => AWARD_ORDER.indexOf(a.kind) - AWARD_ORDER.indexOf(b.kind));
  const heroAward = sorted.find((a) => a.kind === "mvp") ?? sorted.find((a) => a.kind === "team_best") ?? sorted[0];
  if (!heroAward) return null;
  return {
    matchday: input.matchday,
    provisional: input.provisional,
    hero: awardTile(heroAward, input.teams),
    tiles: sorted.filter((a) => a !== heroAward).slice(0, AWARD_TILES).map((a) => awardTile(a, input.teams)),
  };
}
