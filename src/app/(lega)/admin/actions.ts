"use server";

import { revalidatePath } from "next/cache";
import { contractTermsErrors, cutShare, evaluateSigning, evaluateTrade, type TradeParty } from "@/lib/cap";
import { teamPicks, teamSide } from "@/lib/league";
import { loadLeague, loadProfile } from "@/lib/league-server";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string; warnings: string[] } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const done = (message: string, warnings: string[] = []): ActionResult => ({ ok: true, message, warnings });

/** Ogni action ricontrolla il ruolo: la UI nasconde i bottoni, ma i permessi veri sono qui e nella RPC (is_admin). */
async function requireAdmin(): Promise<string | null> {
  const profile = await loadProfile();
  return profile?.role === "admin" ? null : "Solo gli admin possono modificare i dati.";
}

/** Traduce gli errori della RPC (prefissi FORBIDDEN / CONFLICT / INVALID, migrazione 0006) in testo per l'utente. */
function rpcError(message: string): ActionResult {
  const m = /^(FORBIDDEN|CONFLICT|INVALID): ([\s\S]*)$/.exec(message);
  if (!m) return fail(`Operazione non riuscita: ${message}`);
  if (m[1] === "CONFLICT") return fail(`${m[2]}. Aggiorna la pagina (pulsante in alto) e riprova: non è stato salvato nulla.`);
  return fail(m[2]);
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const refresh = () => revalidatePath("/", "layout");

// ---------- Firma ----------
export interface SignInput {
  playerId: number;
  teamId: string;
  slot: "starter" | "reserve";
  years: number | null;
  teamOption: boolean;
  salary: number;
  isRookie: boolean;
  unrestricted: boolean;
  notes: string;
}

export async function signContract(input: SignInput): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!isNum(input.playerId) || !isNum(input.salary) || (input.slot !== "starter" && input.slot !== "reserve")) return fail("Dati non validi.");

  const league = await loadLeague();
  const team = league.teams.find((t) => t.team.id === input.teamId);
  if (!team) return fail("Squadra non trovata.");

  const db = await createClient();
  const player = await db.from("players").select("pos,first_name,last_name").eq("id", input.playerId).maybeSingle<{ pos: "G" | "A" | "C" | null; first_name: string; last_name: string }>();
  if (player.error || !player.data) return fail("Giocatore non trovato.");

  const terms = { slot: input.slot, years: input.years, teamOption: input.teamOption, salary: input.salary };
  const ev = evaluateSigning(teamSide(team), { ...terms, position: player.data.pos }, league.settings);
  if (ev.errors.length) return fail(ev.errors.join(" "));

  const { error } = await db.rpc("admin_sign_contract", {
    p_player_id: input.playerId,
    p_team_id: input.teamId,
    p_slot: input.slot,
    p_years: input.years,
    p_team_option: input.teamOption,
    p_salary: input.salary,
    p_is_rookie: input.isRookie,
    p_restriction: input.unrestricted ? "unrestricted" : null,
    p_notes: input.notes,
  });
  if (error) return rpcError(error.message);
  refresh();
  return done(`${[player.data.first_name, player.data.last_name].join(" ").trim()} firmato da ${team.team.name}.`, ev.warnings);
}

// ---------- Modifica contratto ----------
export interface UpdateInput {
  contractId: number;
  version: number;
  slot: "starter" | "reserve";
  years: number | null;
  teamOption: boolean;
  salary: number;
}

export async function updateContract(input: UpdateInput): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!isNum(input.contractId) || !isNum(input.version)) return fail("Dati non validi.");
  const league = await loadLeague();
  const errors = contractTermsErrors(input, league.settings);
  if (errors.length) return fail(errors.join(" "));

  const db = await createClient();
  const { error } = await db.rpc("admin_update_contract", {
    p_contract_id: input.contractId,
    p_version: input.version,
    p_slot: input.slot,
    p_years: input.years,
    p_team_option: input.teamOption,
    p_salary: input.salary,
  });
  if (error) return rpcError(error.message);
  refresh();
  return done("Contratto aggiornato.");
}

// ---------- Taglio ----------
export async function cutPlayer(input: { contractId: number; version: number }): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  const league = await loadLeague();
  const found = league.teams.flatMap((t) => [...t.starters, ...t.reserves].map((p) => ({ p, team: t.team.name }))).find((x) => x.p.id === input.contractId);
  if (!found) return fail("Contratto non trovato: forse è già stato tagliato o scambiato. Aggiorna la pagina.");

  const share = cutShare(found.p.salary);
  const db = await createClient();
  const { error } = await db.rpc("admin_cut_player", { p_contract_id: input.contractId, p_version: input.version, p_paid_salary: share });
  if (error) return rpcError(error.message);
  refresh();
  return done(`${found.p.name} tagliato da ${found.team}: quota di ${share} crediti. Ora va all'asta dei tagliati.`);
}

// ---------- Scambio ----------
interface Gives {
  contracts: { id: number; version: number }[];
  picks: { id: number; version: number }[];
}
export interface TradeInput {
  teamA: string;
  teamB: string;
  aGives: Gives;
  bGives: Gives;
  approvedBy: string;
  overrideReason: string;
}

export async function executeTrade(input: TradeInput): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  const league = await loadLeague();
  const ta = league.teams.find((t) => t.team.id === input.teamA);
  const tb = league.teams.find((t) => t.team.id === input.teamB);
  if (!ta || !tb || ta === tb) return fail("Servono due squadre diverse.");

  const party = (t: typeof ta, g: Gives): TradeParty => ({
    name: t.team.name,
    side: teamSide(t),
    picks: teamPicks(league, t.team.id),
    gives: { contracts: new Set(g.contracts.map((c) => c.id)), picks: new Set(g.picks.map((p) => p.id)) },
  });
  const ev = evaluateTrade(party(ta, input.aGives), party(tb, input.bGives), league.settings);
  if (ev.errors.length) return fail(ev.errors.join(" "));
  const reason = input.overrideReason.trim();
  if (ev.capBreakers.length && !reason) {
    return fail(`Lo scambio fa sforare il cap di ${ev.capBreakers.join(" e ")} (R-57): serve la motivazione dell'eccezione del moderatore.`);
  }

  const db = await createClient();
  const { error } = await db.rpc("admin_execute_trade", {
    p_team_a: input.teamA,
    p_team_b: input.teamB,
    p_a_gives: input.aGives,
    p_b_gives: input.bGives,
    p_approved_by: input.approvedBy,
    p_override_reason: ev.capBreakers.length ? reason : "",
  });
  if (error) return rpcError(error.message);
  refresh();
  return done(`Scambio registrato tra ${ta.team.name} e ${tb.team.name}.`, ev.warnings);
}
