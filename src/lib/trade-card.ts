// Card di uno scambio eseguito (1200×630): chi riceve cosa, l'eventuale eccezione al cap e la battuta del bot Telegram (stessa
// scelta: `tradeJokes` pesca per id dello scambio). Puro e testato; il disegno è in `components/card-scambio.tsx`.
// Legge `trades.payload` come lo storico (`parseTrade`) e lo arricchisce con ciò che oggi si sa dei contratti e di Dunkest.
import type { Position } from "./cap";
import type { CardTeam } from "./cards";
import { TEAM_COLORS, teamColors } from "./team-colors";
import { fillJoke, tradeJokes, type AnnouncedMove, type AnnouncedTeam, type AnnouncedTrade } from "./trade-announce";
import type { TradeView } from "./trades";

export interface TradeCardItem {
  kind: "player" | "pick" | "talent";
  label: string;
  /** «24 cr», «draft 2026 · diritti», «(OKCC)» */
  detail: string;
  pos: Position | null;
}

export interface TradeCardTeam {
  name: string;
  color: string;
  items: TradeCardItem[];
  /** movimenti oltre quelli che entrano nella card */
  more: number;
  /** nomi di quei movimenti, per la didascalia di Telegram */
  hidden: string[];
}

export interface TradeCardModel {
  id: number;
  /** «29 ott» */
  dateLabel: string;
  teams: TradeCardTeam[];
  capOverride: boolean;
  /** la battuta del bot, senza emoji (i font della card non le hanno); null se non c'è */
  quip: string | null;
}

/** Ciò che si sa oggi di un contratto scambiato (è nella rosa della squadra che l'ha ricevuto). */
export interface TradedPlayer {
  playerId: number;
  name: string;
  pos: Position | null;
  salary: number;
  yearsLeft: number | null;
  rookie: boolean;
}

export interface TradeCardInput {
  trade: { id: number; createdAt: string; capOverrideReason: string | null; view: TradeView };
  teams: Map<string, CardTeam>;
  /** scambi di ogni squadra, questo compreso (serve alle battute su «squadra seriale» e «primo scambio») */
  tradesPerTeam: Map<string, number>;
  /** per id di contratto */
  players: Map<number, TradedPlayer>;
  /** pick per id */
  picks: Map<number, { year: number; round: number; originalTeamName: string }>;
  /** punteggio Dunkest medio e partite giocate, e infortunio, di un giocatore del listone */
  dunkest: { stats: (playerId: number) => { gp: number; pdk: number } | undefined; injured: (playerId: number) => boolean };
}

const MAX_ITEMS: Record<number, number> = { 2: 4, 3: 4 };
const maxItems = (teams: number) => MAX_ITEMS[teams] ?? 3;

const day = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
/** Emoji e simboli pittografici: i font della card non li hanno. */
const stripEmoji = (s: string) => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/\s+/g, " ").trim();
const credits = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })} cr`;

/** Lo scambio nella forma che il bot Telegram dà a `tradeJokes`, con i dati che abbiamo. */
export function announcedFromTrade(input: TradeCardInput): AnnouncedTrade {
  const { trade, teams, tradesPerTeam, players, picks, dunkest } = input;
  const moves = trade.view.moves.map((m): AnnouncedMove => {
    if (m.kind === "pick") {
      const p = picks.get(m.id);
      return { kind: "pick", id: m.id, from: m.from, to: m.to, label: m.label, year: p?.year, round: p?.round, originalTeam: p?.originalTeamName };
    }
    if (m.kind === "talent") {
      return { kind: "talent", id: m.id, from: m.from, to: m.to, label: m.label, name: m.label, draftYear: m.draftYear, entryCredits: m.credits, playerId: m.playerId };
    }
    const p = players.get(m.id);
    const stat = p ? dunkest.stats(p.playerId) : undefined;
    return {
      kind: "contract",
      id: m.id,
      from: m.from,
      to: m.to,
      slot: m.slot,
      label: m.label,
      name: p?.name ?? m.label,
      pos: p?.pos ?? null,
      salary: p?.salary,
      yearsLeft: p?.yearsLeft ?? undefined,
      rookie: p?.rookie,
      pdk: stat?.pdk,
      gp: stat?.gp,
      injury: p && dunkest.injured(p.playerId) ? "infortunato" : undefined,
      playerId: p?.playerId,
    };
  });
  return {
    id: trade.id,
    createdAt: trade.createdAt,
    capOverrideReason: trade.capOverrideReason,
    teams: trade.view.teams.map((id) => ({ id, name: teams.get(id)?.name ?? "?", seasonTrades: tradesPerTeam.get(id) ?? 1 })),
    moves,
  };
}

/** `short`: scambi a quattro squadre, le carte sono strette («Pick 2027 · 1°»). */
function itemOf(m: AnnouncedMove, short: boolean): TradeCardItem {
  if (m.kind === "pick") {
    const what = m.year && m.round ? `Pick ${m.year} · ${m.round}°${short ? "" : " giro"}` : (m.label ?? "Una pick");
    return { kind: "pick", label: what, detail: m.originalTeam ? `di ${m.originalTeam}` : "", pos: null };
  }
  if (m.kind === "talent") {
    const detail = ["diritti", m.draftYear !== undefined ? `draft ${m.draftYear}` : null].filter(Boolean).join(" · ");
    return { kind: "talent", label: m.name ?? m.label ?? "Un talento", detail, pos: null };
  }
  const detail = [m.salary !== undefined ? credits(m.salary) : null, m.slot === "reserve" ? "riserva" : null].filter(Boolean).join(" · ");
  return { kind: "player", label: m.name ?? m.label ?? "Un giocatore", detail, pos: (m.pos as Position | null | undefined) ?? null };
}

/** Colore di una squadra nella card del bot: l'indice della squadra tra tutte le squadre della lega, come `teamColors` (colonna `color_index` di `trade_announce_claim`); senza, quello tra le squadre dello scambio. */
export function announcedTeamColor(announced: AnnouncedTrade, team: AnnouncedTeam): string {
  if (team.colorIndex !== undefined) return TEAM_COLORS[team.colorIndex % TEAM_COLORS.length];
  return teamColors(announced.teams.map((t) => t.id)).get(team.id) ?? TEAM_COLORS[0];
}

/** La card a partire da uno scambio già nella forma del bot (`trade_announce_claim`); `color` dà il colore di ogni squadra. */
export function cardFromAnnounced(announced: AnnouncedTrade, color: (team: AnnouncedTeam) => string): TradeCardModel {
  const limit = maxItems(announced.teams.length);
  const jokes = tradeJokes(announced);
  const quip = jokes.length ? stripEmoji(fillJoke(announced, jokes[0])) : "";
  return {
    id: announced.id,
    dateLabel: announced.createdAt ? day.format(new Date(announced.createdAt)).replace(/\.$/, "") : "",
    teams: announced.teams.map((t) => {
      const got = announced.moves.filter((m) => m.to === t.id).map((m) => itemOf(m, announced.teams.length > 3));
      const shown = got.length > limit ? got.slice(0, limit - 1) : got;
      return { name: t.name, color: color(t), items: shown, more: got.length - shown.length, hidden: got.slice(shown.length).map((i) => i.label) };
    }),
    capOverride: !!announced.capOverrideReason,
    quip: quip || null,
  };
}

/** Modello della card di uno scambio, o null se lo scambio non ha il dettaglio (importato dal foglio o payload vuoto). */
export function tradeCardModel(input: TradeCardInput): TradeCardModel | null {
  if (!input.trade.view.complete) return null;
  return cardFromAnnounced(announcedFromTrade(input), (t) => input.teams.get(t.id)?.color ?? "#1d47b5");
}
