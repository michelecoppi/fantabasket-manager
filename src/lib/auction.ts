// Asta (issue #104): regole pure di un lotto e dei limiti di spesa. Oggi le usa il playground (/asta), domani l'asta vera
// (le RPC controlleranno le stesse cose). Regole in docs/REGOLAMENTO.md (R-xx), proposte e assunzioni in docs/product/PIANO-ASTA.md.
// I tempi sono in millisecondi e arrivano sempre da fuori (`now`), così ogni passaggio è deterministico e testabile.
import { rosterLimitErrors, teamFinance, type AuctionFloor, type LeagueSettings, type Position, type RosterEntry, type TradeSide } from "./cap";

export interface AuctionRules {
  /** Base d'asta = crediti Dunkest × questa frazione (decisione dell'utente 2026-11-02: metà, come all'asta di inizio stagione) */
  baseFraction: number;
  /** Rilancio minimo (decisione dell'utente 2026-11-02: 0,5) */
  step: number;
  /** Secondi per rilanciare dopo la chiamata */
  openSeconds: number;
  /** Dopo un rilancio il cronometro riparte da qui (se ne restava di più, resta com'era) */
  bidSeconds: number;
  /** R-23: secondi per decidere se pareggiare */
  matchSeconds: number;
}

/**
 * Proposta per il playground, da far provare alla lega: diventeranno chiavi di `league_settings` quando l'asta sarà vera.
 * 15″ per la prima offerta (il tempo di leggere il giocatore), 10″ dopo ogni rilancio: un lotto conteso dura circa un minuto.
 */
export const PROPOSED_RULES: AuctionRules = { baseFraction: 0.5, step: 0.5, openSeconds: 15, bidSeconds: 10, matchSeconds: 15 };

export type LotKind = "free" | "cut" | "restricted";
export type LotPhase = "open" | "match" | "sold" | "unsold";

export interface LotPlayer {
  id: number;
  name: string;
  pos: Position | null;
  nbaTeam: string | null;
  credits: number;
  pdk: number | null;
}

export interface Bid {
  teamId: string;
  amount: number;
  at: number;
}

export interface LotResult {
  teamId: string;
  amount: number;
  /** R-23: vinto pareggiando l'offerta più alta */
  matched: boolean;
}

export interface Lot {
  player: LotPlayer;
  kind: LotKind;
  /** cut: ex proprietario, escluso (R-41); restricted: squadra con il diritto di pareggio (R-23) */
  formerTeamId: string | null;
  base: number;
  /** null = chiamato dall'app (asta dei tagliati) */
  calledBy: string | null;
  bids: Bid[];
  /** apertura del lotto: con l'ultima offerta dice da dove è partito il cronometro */
  openedAt: number;
  phase: LotPhase;
  /** fine del tempo per rilanciare (open) o per pareggiare (match) */
  deadline: number;
  /** ms rimasti, con l'asta in pausa */
  pausedLeft: number | null;
  result: LotResult | null;
}

const EPS = 1e-9;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Arrotonda per eccesso al passo dei rilanci (3,75 → 4 con il passo 0,5). */
export function ceilToStep(x: number, step: number): number {
  return round1(Math.ceil(x / step - EPS) * step);
}

/** Per difetto al passo: una squadra con 12,3 di spazio può offrire al massimo 12. */
export function floorToStep(x: number, step: number): number {
  return round1(Math.floor(x / step + EPS) * step);
}

/**
 * Base d'asta: metà dei crediti Dunkest arrotondata per eccesso al passo (ASSUNZIONE: con il passo 0,5 tutte le offerte restano
 * sul mezzo credito), almeno un passo. R-25: un ex-contratto non parte mai sotto il suo minimo (anche lui arrotondato al passo).
 */
export function auctionBase(credits: number, floor: AuctionFloor | null, r: AuctionRules): number {
  const dunkest = ceilToStep(credits * r.baseFraction, r.step);
  return Math.max(dunkest, floor ? ceilToStep(floor.minimum, r.step) : 0, r.step);
}

export const leader = (lot: Lot): Bid | null => lot.bids.at(-1) ?? null;

/** Offerta minima adesso: la base se nessuno ha offerto, altrimenti chi supera di almeno un passo (R-51: il pareggio non vince). */
export function minimumBid(lot: Lot, r: AuctionRules): number {
  const top = leader(lot);
  return top ? round1(top.amount + r.step) : lot.base;
}

/** Chi chiama apre alla base, se può offrire (non l'ex proprietario di un tagliato né chi ha il diritto di pareggio). */
export function openLot(
  input: { player: LotPlayer; kind: LotKind; formerTeamId: string | null; base: number; calledBy: string | null; openingAmount: number | null },
  now: number,
  r: AuctionRules,
): Lot {
  const { openingAmount, ...rest } = input;
  const lot: Lot = { ...rest, bids: [], openedAt: now, phase: "open", deadline: now + r.openSeconds * 1000, pausedLeft: null, result: null };
  if (rest.calledBy && openingAmount !== null && !excludedReason(lot, rest.calledBy)) {
    lot.bids = [{ teamId: rest.calledBy, amount: Math.max(openingAmount, rest.base), at: now }];
  }
  return lot;
}

/** Perché una squadra non partecipa al lotto, a prescindere dai crediti (null = partecipa). */
export function excludedReason(lot: Lot, teamId: string): string | null {
  if (lot.kind === "cut" && lot.formerTeamId === teamId) return "Ex proprietario: non partecipa all'asta dei tagliati (R-41).";
  if (lot.kind === "restricted" && lot.formerTeamId === teamId) return "Hai il diritto di pareggio: aspetti la fine e decidi (R-23).";
  return null;
}

/** Errori di un'offerta (vuoto = valida). `limit` = quanto può spendere la squadra per questo giocatore (`bidLimit`). */
export function bidErrors(lot: Lot, teamId: string, amount: number, now: number, limit: number, r: AuctionRules): string[] {
  if (lot.phase !== "open") return ["L'asta su questo giocatore è chiusa."];
  if (lot.pausedLeft !== null) return ["Asta in pausa."];
  if (now >= lot.deadline) return ["Tempo scaduto."];
  const excluded = excludedReason(lot, teamId);
  if (excluded) return [excluded];
  if (leader(lot)?.teamId === teamId) return ["Sei già in testa."];
  const min = minimumBid(lot, r);
  const out: string[] = [];
  if (!Number.isFinite(amount) || amount + EPS < min) out.push(leader(lot) ? `Il pareggio non vince: serve almeno ${min} (R-51).` : `La base d'asta è ${min}.`);
  else if (Math.abs(ceilToStep(amount, r.step) - amount) > EPS) out.push(`Le offerte vanno di ${r.step} in ${r.step}.`);
  if (amount > limit + EPS) out.push(`Non hai spazio: puoi offrire al massimo ${limit}.`);
  return out;
}

/** Offerta valida: entra e il cronometro riparte da `bidSeconds` (se ne restava di più, resta com'era). */
export function placeBid(lot: Lot, teamId: string, amount: number, now: number, limit: number, r: AuctionRules): { lot: Lot; errors: string[] } {
  const errors = bidErrors(lot, teamId, amount, now, limit, r);
  if (errors.length) return { lot, errors };
  const deadline = Math.max(lot.deadline, now + r.bidSeconds * 1000);
  return { lot: { ...lot, bids: [...lot.bids, { teamId, amount: round1(amount), at: now }], deadline }, errors: [] };
}

/**
 * Allo scadere: con un diritto di pareggio aperto e una squadra che può permetterselo si passa al pareggio (anche senza offerte,
 * alla base: proposta), altrimenti chi è in testa vince; senza offerte il lotto resta invenduto. `holderLimit` = `bidLimit` di
 * chi ha il diritto. Allo scadere del pareggio vince chi era in testa.
 */
export function advance(lot: Lot, now: number, r: AuctionRules, holderLimit = 0): Lot {
  if (lot.pausedLeft !== null || now < lot.deadline) return lot;
  const top = leader(lot);
  if (lot.phase === "open") {
    const price = top?.amount ?? lot.base;
    if (lot.kind === "restricted" && lot.formerTeamId && holderLimit + EPS >= price) {
      return { ...lot, phase: "match", deadline: now + r.matchSeconds * 1000 };
    }
    return settle(lot, top);
  }
  if (lot.phase === "match") return settle(lot, top);
  return lot;
}

function settle(lot: Lot, top: Bid | null): Lot {
  return top ? { ...lot, phase: "sold", result: { teamId: top.teamId, amount: top.amount, matched: false } } : { ...lot, phase: "unsold", result: null };
}

/** Prezzo da pareggiare (R-23): l'offerta più alta, o la base se nessuno ha offerto. */
export const matchPrice = (lot: Lot): number => leader(lot)?.amount ?? lot.base;

/** R-23: chi ha il diritto pareggia l'offerta più alta, senza replica. */
export function matchRight(lot: Lot, teamId: string): Lot {
  if (lot.phase !== "match" || lot.formerTeamId !== teamId) return lot;
  return { ...lot, phase: "sold", result: { teamId, amount: matchPrice(lot), matched: true } };
}

/** R-23: chi ha il diritto rinuncia, il giocatore va a chi era in testa. */
export function declineRight(lot: Lot, teamId: string): Lot {
  if (lot.phase !== "match" || lot.formerTeamId !== teamId) return lot;
  return settle(lot, leader(lot));
}

export const isLive = (lot: Lot) => lot.phase === "open" || lot.phase === "match";

export function pauseLot(lot: Lot, now: number): Lot {
  if (!isLive(lot) || lot.pausedLeft !== null) return lot;
  return { ...lot, pausedLeft: Math.max(0, lot.deadline - now) };
}

/** Alla ripresa restano almeno 3 secondi: nessuno perde un lotto mentre l'asta riparte. */
export function resumeLot(lot: Lot, now: number): Lot {
  if (lot.pausedLeft === null) return lot;
  return { ...lot, deadline: now + Math.max(lot.pausedLeft, 3000), pausedLeft: null };
}

/** Admin: toglie l'ultima offerta (errore di battitura, rilancio per sbaglio) e ridà il tempo di un rilancio. */
export function undoLastBid(lot: Lot, now: number, r: AuctionRules): Lot {
  if (lot.phase !== "open" || lot.bids.length === 0) return lot;
  const deadline = lot.pausedLeft === null ? now + r.bidSeconds * 1000 : lot.deadline;
  const pausedLeft = lot.pausedLeft === null ? null : r.bidSeconds * 1000;
  return { ...lot, bids: lot.bids.slice(0, -1), deadline, pausedLeft };
}

/** Admin: «aggiudica adesso», come se il tempo fosse finito (il pareggio resta). */
export function closeNow(lot: Lot, now: number, r: AuctionRules, holderLimit = 0): Lot {
  if (!isLive(lot)) return lot;
  return advance({ ...lot, deadline: now, pausedLeft: null }, now, r, holderLimit);
}

export function secondsLeft(lot: Lot, now: number): number {
  const ms = lot.pausedLeft ?? lot.deadline - now;
  return Math.max(0, ms / 1000);
}

/** Durata del giro di cronometro in corso (per la barra): dall'ultima offerta, o dall'apertura, alla scadenza. */
export function clockSpan(lot: Lot, r: AuctionRules): number {
  if (lot.phase === "match") return r.matchSeconds;
  const from = Math.max(lot.openedAt, leader(lot)?.at ?? 0);
  return Math.max(r.bidSeconds, (lot.deadline - from) / 1000);
}

// ---------- Limiti di spesa ----------

export interface BidLimit {
  /** massimo per un titolare (null = nessun posto da titolare in quel ruolo) */
  starter: number | null;
  /** massimo per una riserva (null = nessun posto da riserva) */
  reserve: number | null;
  /** quanto può offrire: il più alto dei due, 0 se non c'è posto */
  max: number;
  /** offrire oltre questa cifra porta il monte ingaggi sopra il cap (luxury tax, R-12) */
  capSpace: number;
}

const slotFree = (side: TradeSide, entry: RosterEntry, s: LeagueSettings) =>
  rosterLimitErrors(side.roster, [...side.roster, entry], s).length === 0;

/**
 * Quanto può offrire una squadra per un giocatore di quel ruolo. Titolare: spazio salariale più la zona della luxury tax fino al
 * massimo tassabile (R-12, ASSUNZIONE: come oggi una firma sopra il cap avvisa e non blocca, ma oltre i 270 non si va). Riserva: il
 * budget riserve rimasto (R-03). Contano i massimi di rosa (R-01..R-03), come alla firma.
 */
export function bidLimit(side: TradeSide, pos: Position | null, s: LeagueSettings, r: AuctionRules): BidLimit {
  const f = teamFinance(side.roster, side.cuts, side.bonus, s);
  const starterOk = slotFree(side, { position: pos, slot: "starter", salary: 0 }, s);
  const reserveOk = slotFree(side, { position: pos, slot: "reserve", salary: 0 }, s);
  const starter = starterOk ? Math.max(0, floorToStep(f.capSpace + s.taxMaxOver, r.step)) : null;
  const reserve = reserveOk ? Math.max(0, floorToStep(f.reserveSpace, r.step)) : null;
  return { starter, reserve, max: Math.max(starter ?? 0, reserve ?? 0), capSpace: f.capSpace };
}

/**
 * Dove entra il giocatore vinto (proposta: lo conferma il vincitore con la durata, che si sceglie dopo, R-51). Titolare se ci sta
 * nel cap, altrimenti riserva se ci sta nel budget riserve, altrimenti titolare in luxury tax.
 */
export function landingSlot(side: TradeSide, pos: Position | null, amount: number, s: LeagueSettings, r: AuctionRules): "starter" | "reserve" | null {
  const lim = bidLimit(side, pos, s, r);
  if (lim.starter !== null && amount <= lim.capSpace + EPS) return "starter";
  if (lim.reserve !== null && amount <= lim.reserve + EPS) return "reserve";
  if (lim.starter !== null && amount <= lim.starter + EPS) return "starter";
  return null;
}

/** La squadra dopo l'acquisto: il contratto entra con un id negativo (non esiste ancora nel database). */
export function addSigning(side: TradeSide, entry: RosterEntry, id: number): TradeSide {
  return { ...side, roster: [...side.roster, { ...entry, id }] };
}

// ---------- Turni di chiamata ----------

/** Prossima squadra che chiama, a giro nell'ordine dato, saltando chi non può (rosa piena o passa). null = nessuno. */
export function nextCaller(order: readonly string[], last: string | null, canCall: (teamId: string) => boolean): string | null {
  const start = last === null ? 0 : order.indexOf(last) + 1;
  for (let i = 0; i < order.length; i++) {
    const id = order[(start + i) % order.length];
    if (canCall(id)) return id;
  }
  return null;
}
