import { evaluateTrade, type TradeEvaluation } from "./cap";
import type { LeagueView, Versions } from "./league";
import { simTeams } from "./sim-teams";
import { draftFromMoves, staleMoves, toParties, type TradeMoveInput } from "./trade-draft";

/**
 * Proposte di scambio tra squadre (Fase 7, docs/product/PIANO-PROPOSTE-SCAMBIO.md): righe di `trade_proposals` lette con RLS
 * (solo squadre coinvolte e admin) e raggruppate per chi guarda. Nessuna regola di lega qui: l'esito è sempre `evaluateTrade`.
 */
export type ProposalStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "expired" | "superseded" | "approved" | "declined";

export interface ProposalMove extends TradeMoveInput {
  /** nome del giocatore o della pick al momento dell'invio (resta anche se poi il giocatore cambia squadra) */
  label?: string;
}

export interface ProposalAnswer {
  teamId: string;
  answer: "accept" | "reject";
  note: string | null;
  at: string;
}

export interface Proposal {
  id: number;
  version: number;
  /** stato effettivo: una `pending` oltre la scadenza vale già come `expired`, anche prima che il cron la marchi */
  status: ProposalStatus;
  proposerTeamId: string;
  teams: string[];
  moves: ProposalMove[];
  message: string | null;
  capReason: string | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  parentId: number | null;
  tradeId: number | null;
  dunkestDoneAt: string | null;
  answers: ProposalAnswer[];
  /** millisecondi alla scadenza delle risposte, solo per le `pending` */
  msLeft: number | null;
}

/** Riga come la legge `loadProposals` (con le risposte annidate). */
export interface ProposalRow {
  id: number;
  version: number;
  status: ProposalStatus;
  proposer_team_id: string;
  teams: string[];
  moves: unknown;
  message: string | null;
  cap_exception_reason: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decision_note: string | null;
  parent_id: number | null;
  trade_id: number | null;
  dunkest_done_at: string | null;
  trade_proposal_answers: { team_id: string; answer: "accept" | "reject"; note: string | null; at: string }[] | null;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** Movimenti salvati (`moves jsonb`, formato di `admin_execute_trade`); quelli malformati si scartano. */
export function parseProposalMoves(json: unknown): ProposalMove[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x): ProposalMove[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const kind = o.kind === "contract" || o.kind === "pick" ? o.kind : undefined;
    const from = str(o.from);
    const to = str(o.to);
    if (!kind || !from || !to || typeof o.id !== "number" || typeof o.version !== "number") return [];
    const slot = kind === "contract" && (o.slot === "starter" || o.slot === "reserve") ? o.slot : undefined;
    return [{ kind, id: o.id, version: o.version, from, to, ...(slot ? { slot } : {}), ...(str(o.label) ? { label: str(o.label) } : {}) }];
  });
}

export function toProposal(r: ProposalRow, now: number): Proposal {
  const left = Date.parse(r.expires_at) - now;
  const expired = r.status === "pending" && left <= 0;
  return {
    id: r.id,
    version: r.version,
    status: expired ? "expired" : r.status,
    proposerTeamId: r.proposer_team_id,
    teams: r.teams,
    moves: parseProposalMoves(r.moves),
    message: r.message,
    capReason: r.cap_exception_reason,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    decidedAt: expired ? r.expires_at : r.decided_at,
    decisionNote: r.decision_note,
    parentId: r.parent_id,
    tradeId: r.trade_id,
    dunkestDoneAt: r.dunkest_done_at,
    answers: (r.trade_proposal_answers ?? []).map((a) => ({ teamId: a.team_id, answer: a.answer, note: a.note, at: a.at })),
    msLeft: r.status === "pending" && !expired ? left : null,
  };
}

export const isOpen = (p: Proposal) => p.status === "pending" || p.status === "accepted";

/** La squadra deve ancora rispondere: è coinvolta, non ha proposto, la proposta è in attesa e lei non ha risposto. */
export function awaitsAnswer(p: Proposal, teamId: string | null | undefined): boolean {
  return !!teamId && p.status === "pending" && p.proposerTeamId !== teamId && p.teams.includes(teamId) && !p.answers.some((a) => a.teamId === teamId);
}

/** Lo scambio è stato eseguito ma va ancora rifatto su Dunkest (lo conferma un admin). */
export const awaitsDunkest = (p: Proposal) => p.status === "approved" && !p.dunkestDoneAt;

export interface ProposalGroups {
  /** aspettano la risposta della tua squadra */
  toAnswer: Proposal[];
  /** aperte e con la tua squadra dentro (inviate da te, o già accettate da te) */
  open: Proposal[];
  /** aperte tra altre squadre: le vede solo un admin (RLS) */
  others: Proposal[];
  /** concluse, dalla più recente */
  archive: Proposal[];
}

export function groupProposals(list: readonly Proposal[], teamId: string | null | undefined): ProposalGroups {
  const g: ProposalGroups = { toAnswer: [], open: [], others: [], archive: [] };
  for (const p of list) {
    if (awaitsAnswer(p, teamId)) g.toAnswer.push(p);
    else if (isOpen(p)) (teamId && p.teams.includes(teamId) ? g.open : g.others).push(p);
    else g.archive.push(p);
  }
  const recent = (p: Proposal) => p.decidedAt ?? p.createdAt;
  g.toAnswer.sort((a, b) => (a.msLeft ?? 0) - (b.msLeft ?? 0));
  g.archive.sort((a, b) => recent(b).localeCompare(recent(a)));
  return g;
}

/** Numeri dei badge: proposte che aspettano la tua risposta (voce «Scambio») e, per un admin, lavoro in coda (voce «Admin»). */
export function proposalBadges(list: readonly Proposal[], teamId: string | null | undefined, admin: boolean): { answer: number; admin: number } {
  return {
    answer: list.filter((p) => awaitsAnswer(p, teamId)).length,
    admin: admin ? list.filter((p) => p.status === "accepted" || awaitsDunkest(p)).length : 0,
  };
}

/** "3 h 20 min", "45 min", "18 h": tempo che resta per rispondere. */
export function timeLeft(ms: number): string {
  if (ms <= 0) return "scaduta";
  const min = Math.max(1, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h < 3 && m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Etichetta salvata con il movimento: resta nello storico anche se il giocatore viene poi tagliato (le RPC leggono solo id e version). */
export function moveLabel(league: LeagueView, m: Pick<TradeMoveInput, "kind" | "id">): string | undefined {
  if (m.kind === "contract") {
    for (const t of league.teams) {
      const p = [...t.starters, ...t.reserves].find((x) => x.id === m.id);
      if (p) return p.name;
    }
    return undefined;
  }
  const pick = league.picks.find((x) => x.id === m.id);
  return pick ? `Draft ${pick.year} · ${pick.round}° giro (${league.teamNames.get(pick.original_team_id) ?? "?"})` : undefined;
}

/**
 * Esito di uno scambio salvato (o in arrivo da un client) sulla lega di adesso: la stessa strada del simulatore (bozza ->
 * `toParties` -> `evaluateTrade`), così action e UI non divergono. `stale`: movimenti che non valgono più (con `versions`, anche
 * versione cambiata); `names`: squadre nell'ordine dello scambio, undefined se una non esiste.
 */
export function evaluateMoves(
  league: LeagueView,
  teams: readonly string[],
  moves: readonly TradeMoveInput[],
  versions?: Pick<Versions, "contracts" | "picks">,
): { ev: TradeEvaluation; stale: TradeMoveInput[]; names: string[] | undefined } {
  const sim = simTeams(league, versions);
  const found = teams.map((id) => sim.find((t) => t.id === id)?.name);
  return {
    ev: evaluateTrade(toParties(sim, draftFromMoves(teams, moves)), league.settings),
    stale: staleMoves(sim, moves),
    names: found.every((n): n is string => !!n) ? found : undefined,
  };
}

/** "A, B e C" */
export const joinNames = (names: readonly string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? ""));
