"use server";

import { revalidatePath } from "next/cache";
import { done, fail, isNum, rpcError, type ActionResult } from "@/lib/action-result";
import { loadLeague, loadProfile, loadProposals, loadTradeMarket, loadVersions } from "@/lib/league-server";
import { createClient } from "@/lib/supabase/server";
import { tradeInputError, type TradeMoveInput } from "@/lib/trade-draft";
import { evaluateMoves, joinNames, moveLabel } from "@/lib/trade-proposals";

/**
 * Action delle squadre sulle proposte di scambio (Fase 7.3). Prima scrittura dei viewer: passano solo dalle RPC `trade_*`, che
 * controllano la squadra di chi chiama (`my_team_id()`); qui si ricontrollano le regole di lega con `evaluateTrade`.
 */

const MAX_TEXT = 1000;
const refresh = () => revalidatePath("/", "layout");

/** Squadra dell'utente loggato, o il motivo per cui non può agire. */
async function myTeam(): Promise<{ teamId: string } | { error: string }> {
  try {
    const profile = await loadProfile();
    return profile?.team_id ? { teamId: profile.team_id } : { error: "Serve un account collegato a una squadra: chiedi a un admin." };
  } catch {
    return { error: "Profilo non disponibile al momento: riprova tra poco. Non è stato salvato nulla." };
  }
}

export interface ProposeInput {
  teams: string[];
  moves: TradeMoveInput[];
  message: string;
  /** R-57: richiesta di eccezione al cap, obbligatoria se lo scambio fa sforare qualcuno */
  capReason: string;
  /** controproposta (o proposta rifatta): la proposta di partenza, che la RPC chiude nella stessa transazione */
  parent: number | null;
}

export async function proposeTrade(input: ProposeInput): Promise<ActionResult> {
  const me = await myTeam();
  if ("error" in me) return fail(me.error);
  const bad = tradeInputError(input.teams, input.moves);
  if (bad) return fail(bad);
  if (!input.teams.includes(me.teamId)) return fail("Puoi proporre solo scambi della tua squadra.");
  if (input.moves.length === 0) return fail("Lo scambio è vuoto.");
  if (input.parent !== null && !isNum(input.parent)) return fail("Dati non validi.");
  const message = String(input.message ?? "").trim();
  const capReason = String(input.capReason ?? "").trim();
  if (message.length > MAX_TEXT || capReason.length > MAX_TEXT) return fail(`Messaggio troppo lungo (al massimo ${MAX_TEXT} caratteri).`);
  if ((await loadTradeMarket()) === false) return fail("Il mercato degli scambi è chiuso: si riapre quando lo decide un admin.");

  const [league, versions] = await Promise.all([loadLeague(), loadVersions()]);
  const { ev, stale, names } = evaluateMoves(league, input.teams, input.moves, versions);
  if (!names) return fail("Una squadra dello scambio non esiste.");
  if (stale.length) return fail("Un giocatore o una pick dello scambio è cambiato nel frattempo. Aggiorna la pagina (pulsante in alto) e riprova.");
  if (ev.errors.length) return fail(ev.errors.join(" "));
  if (ev.capBreakers.length && !capReason) {
    return fail(`Lo scambio fa sforare il cap di ${ev.capBreakers.join(", ")} (R-57): scrivi la richiesta di eccezione per l'admin.`);
  }

  const db = await createClient();
  const { error } = await db.rpc("trade_propose", {
    p_teams: input.teams,
    p_moves: input.moves.map((m) => ({ ...m, label: moveLabel(league, m) })),
    p_roster_revs: Object.fromEntries(input.teams.map((id) => [id, versions.rosterRev[id] ?? null])),
    p_message: message,
    p_cap_reason: ev.capBreakers.length ? capReason : "",
    p_parent: input.parent,
  });
  if (error) return rpcError(error.message);
  refresh();
  const others = names.filter((_, i) => input.teams[i] !== me.teamId);
  return done(`Proposta inviata a ${joinNames(others)}: hanno ${league.settings.tradeProposalHours} ore per rispondere.`, ev.warnings);
}

export async function answerProposal(input: { id: number; version: number; answer: "accept" | "reject"; note: string }): Promise<ActionResult> {
  const me = await myTeam();
  if ("error" in me) return fail(me.error);
  if (!isNum(input.id) || !isNum(input.version) || (input.answer !== "accept" && input.answer !== "reject")) return fail("Dati non validi.");
  const note = String(input.note ?? "").trim();
  if (note.length > MAX_TEXT) return fail(`Nota troppo lunga (al massimo ${MAX_TEXT} caratteri).`);

  const proposal = (await loadProposals())?.find((p) => p.id === input.id);
  if (!proposal) return fail("Proposta non disponibile.");
  // Accettare vuol dire dire sì allo scambio di adesso: si rivaluta sulle rose attuali (le regole sono solo in cap.ts).
  if (input.answer === "accept") {
    const [league, versions] = await Promise.all([loadLeague(), loadVersions()]);
    const { ev, stale } = evaluateMoves(league, proposal.teams, proposal.moves, versions);
    if (stale.length) return fail("Un giocatore o una pick della proposta è cambiato: la proposta va rifatta (rifiutala o controproponi).");
    if (ev.errors.length) return fail(`Con le rose di adesso lo scambio non è in regola: ${ev.errors.join(" ")}`);
  }

  const db = await createClient();
  const { error } = await db.rpc("trade_answer", { p_id: input.id, p_version: input.version, p_answer: input.answer, p_note: note });
  if (error) return rpcError(error.message);
  refresh();
  if (input.answer === "reject") return done("Proposta rifiutata.");
  const accepts = proposal.answers.filter((a) => a.answer === "accept").length + 1;
  return done(accepts >= proposal.teams.length - 1 ? "Accettata da tutte le squadre: ora la approva un admin." : "Hai accettato: manca la risposta delle altre squadre.");
}

export async function withdrawProposal(input: { id: number; version: number }): Promise<ActionResult> {
  const me = await myTeam();
  if ("error" in me) return fail(me.error);
  if (!isNum(input.id) || !isNum(input.version)) return fail("Dati non validi.");
  const db = await createClient();
  const { error } = await db.rpc("trade_withdraw", { p_id: input.id, p_version: input.version });
  if (error) return rpcError(error.message);
  refresh();
  return done("Proposta ritirata.");
}
