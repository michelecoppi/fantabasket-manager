"use server";

import { revalidatePath } from "next/cache";
import {
  auctionFloor,
  auctionFloorErrors,
  contractTermsErrors,
  cutShare,
  evaluateContractEdit,
  evaluateSigning,
  evaluateTrade,
  pickLimitWarnings,
  pickYearAllowed,
  signingRestriction,
  type TradeParty,
} from "@/lib/cap";
import { teamPicks, teamSide } from "@/lib/league";
import { teamAlignment } from "@/lib/dunkest-align";
import { runDunkestLeagueSync } from "@/lib/dunkest-league-sync";
import { runDunkestSync } from "@/lib/dunkest-sync";
import { loadCloseInput, loadDunkestRosters, loadLastContract, loadLeague, loadProfile, loadVersions } from "@/lib/league-server";
import { planSeasonClose, SEASON_CLOSE_ENABLED, type CloseChoices } from "@/lib/season-close";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string; warnings: string[] } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const done = (message: string, warnings: string[] = []): ActionResult => ({ ok: true, message, warnings });

/** Ogni action ricontrolla il ruolo: la UI nasconde i bottoni, ma i permessi veri sono qui e nella RPC (is_admin). */
async function requireAdmin(): Promise<string | null> {
  try {
    const profile = await loadProfile();
    return profile?.role === "admin" ? null : "Solo gli admin possono modificare i dati.";
  } catch {
    return "Profilo non disponibile al momento: riprova tra poco. Non è stato salvato nulla.";
  }
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

  const terms = { slot: input.slot, years: input.years, teamOption: input.teamOption, salary: input.salary, isRookie: input.isRookie };
  const ev = evaluateSigning(teamSide(team), { ...terms, position: player.data.pos }, league.settings);
  // R-25: vale per firma normale e asta dei tagliati, quindi si controlla prima di scegliere il percorso.
  const last = await loadLastContract(input.playerId);
  const floorErrors = auctionFloorErrors(input.salary, auctionFloor(last, new Date().toISOString().slice(0, 10), league.settings));
  // R-24: con un diritto restricted aperto il contratto è unrestricted e il diritto si consuma; lo impone anche il trigger del database.
  const restriction = signingRestriction(last, input.unrestricted);
  const rightNote = restriction.consumesRight ? " Diritto di pareggio consumato: contratto unrestricted (R-24)." : "";
  const errors = [...ev.errors, ...floorErrors];
  if (errors.length) return fail(errors.join(" "));
  const name = [player.data.first_name, player.data.last_name].join(" ").trim();

  // Asta dei tagliati (R-41): se il giocatore è tagliato e ancora in attesa, la firma chiude anche il taglio nella stessa transazione.
  const pendingCut = league.teams.flatMap((t) => t.cuts.map((c) => ({ c, team: t }))).find((x) => x.c.playerId === input.playerId && x.c.status === "pending");
  if (pendingCut) {
    if (pendingCut.team.team.id === input.teamId) {
      return fail(`${name} è stato tagliato da ${team.team.name}: l'ex proprietario non può partecipare all'asta dei tagliati (R-41). Per farlo rientrare usa Rose → Tagliati.`);
    }
    const versions = await loadVersions();
    const { error } = await db.rpc("admin_award_cut", {
      p_cut_id: pendingCut.c.id,
      p_version: versions.cuts[pendingCut.c.id] ?? 0,
      p_team_id: input.teamId,
      p_slot: input.slot,
      p_years: input.years,
      p_team_option: input.teamOption,
      p_salary: input.salary,
      p_is_rookie: input.isRookie,
      p_restriction: restriction.unrestricted ? "unrestricted" : null,
      p_notes: input.notes,
      p_roster_rev: versions.rosterRev[input.teamId] ?? null,
    });
    if (error) return rpcError(error.message);
    refresh();
    return done(`${name} preso da ${team.team.name} all'asta dei tagliati: ${pendingCut.team.team.name} non paga più la quota.${rightNote}`, ev.warnings);
  }

  const { error } = await db.rpc("admin_sign_contract", {
    p_player_id: input.playerId,
    p_team_id: input.teamId,
    p_slot: input.slot,
    p_years: input.years,
    p_team_option: input.teamOption,
    p_salary: input.salary,
    p_is_rookie: input.isRookie,
    p_restriction: restriction.unrestricted ? "unrestricted" : null,
    p_notes: input.notes,
    p_roster_rev: (await loadVersions()).rosterRev[input.teamId] ?? null,
  });
  if (error) return rpcError(error.message);
  refresh();
  return done(`${name} firmato da ${team.team.name}.${rightNote}`, ev.warnings);
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
  const owner = league.teams.find((t) => [...t.starters, ...t.reserves].some((p) => p.id === input.contractId));
  const current = owner && [...owner.starters, ...owner.reserves].find((p) => p.id === input.contractId);
  if (!owner || !current) return fail("Contratto non trovato: forse è stato tagliato o scambiato. Aggiorna la pagina.");
  const ev = evaluateContractEdit(teamSide(owner), input.contractId, { ...input, isRookie: current.rookie, position: current.pos }, league.settings);
  if (ev.errors.length) return fail(ev.errors.join(" "));

  const db = await createClient();
  const { error } = await db.rpc("admin_update_contract", {
    p_contract_id: input.contractId,
    p_version: input.version,
    p_slot: input.slot,
    p_years: input.years,
    p_team_option: input.teamOption,
    p_salary: input.salary,
    p_roster_rev: (await loadVersions()).rosterRev[owner.team.id] ?? null,
  });
  if (error) return rpcError(error.message);
  refresh();
  return done("Contratto aggiornato.", ev.warnings);
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

  // Le etichette restano nello storico anche se il giocatore viene poi tagliato (le RPC leggono solo id e version).
  const players = new Map(league.teams.flatMap((t) => [...t.starters, ...t.reserves].map((p) => [p.id, p.name] as const)));
  const label = (g: Gives) => ({
    contracts: g.contracts.map((c) => ({ ...c, label: players.get(c.id) })),
    picks: g.picks.map((p) => {
      const pick = league.picks.find((x) => x.id === p.id);
      return { ...p, label: pick ? `Draft ${pick.year} · ${pick.round}° giro (${league.teamNames.get(pick.original_team_id) ?? "?"})` : undefined };
    }),
  });

  const { rosterRev } = await loadVersions();
  const db = await createClient();
  const { error } = await db.rpc("admin_execute_trade", {
    p_team_a: input.teamA,
    p_team_b: input.teamB,
    p_a_gives: label(input.aGives),
    p_b_gives: label(input.bGives),
    p_approved_by: input.approvedBy,
    p_override_reason: ev.capBreakers.length ? reason : "",
    p_roster_revs: { [input.teamA]: rosterRev[input.teamA] ?? null, [input.teamB]: rosterRev[input.teamB] ?? null },
  });
  if (error) return rpcError(error.message);
  refresh();
  return done(`Scambio registrato tra ${ta.team.name} e ${tb.team.name}.`, ev.warnings);
}

// ---------- Rimozione (correzione di un errore, senza quota di taglio) ----------
export async function removeContract(input: { contractId: number; version: number; reason: string }): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!isNum(input.contractId) || !isNum(input.version)) return fail("Dati non validi.");
  const league = await loadLeague();
  const found = league.teams.flatMap((t) => [...t.starters, ...t.reserves].map((p) => ({ p, team: t.team.name }))).find((x) => x.p.id === input.contractId);
  if (!found) return fail("Contratto non trovato: forse è già stato tagliato o scambiato. Aggiorna la pagina.");

  const db = await createClient();
  const { error } = await db.rpc("admin_remove_contract", { p_contract_id: input.contractId, p_version: input.version, p_reason: input.reason });
  if (error) return rpcError(error.message);
  refresh();
  return done(`Contratto di ${found.p.name} (${found.team}) rimosso. Nessuna quota da pagare.`);
}

// ---------- Durate in blocco ----------
export async function setDurations(items: { contractId: number; version: number; years: number | null; teamOption: boolean }[]): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!Array.isArray(items) || items.length === 0) return fail("Nessuna durata da salvare.");
  const league = await loadLeague();
  const byId = new Map(league.teams.flatMap((t) => [...t.starters, ...t.reserves]).map((p) => [p.id, p]));
  for (const it of items) {
    if (!isNum(it.contractId) || !isNum(it.version)) return fail("Dati non validi.");
    const p = byId.get(it.contractId);
    if (!p) return fail("Un contratto non esiste più: aggiorna la pagina.");
    const errors = contractTermsErrors({ slot: p.slot, years: it.years, teamOption: it.teamOption, salary: p.salary, isRookie: p.rookie }, league.settings);
    if (errors.length) return fail(`${p.name}: ${errors.join(" ")}`);
  }

  const db = await createClient();
  const { error } = await db.rpc("admin_set_durations", {
    p_items: items.map((it) => ({ id: it.contractId, version: it.version, years: it.years, team_option: it.teamOption })),
  });
  if (error) return rpcError(error.message);
  refresh();
  return done(items.length === 1 ? "Durata salvata." : `Durata salvata per ${items.length} contratti.`);
}

// ---------- Ciclo del taglio (R-41, R-42) ----------
function findCut(league: Awaited<ReturnType<typeof loadLeague>>, cutId: number) {
  for (const t of league.teams) {
    const c = t.cuts.find((x) => x.id === cutId);
    if (c) return { cut: c, team: t };
  }
  return null;
}

/** Nessuno lo ha preso all'asta e la squadra rinuncia al giocatore: libera il posto, la quota resta fino a fine contratto. */
export async function finalizeCut(input: { cutId: number; version: number }): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!isNum(input.cutId) || !isNum(input.version)) return fail("Dati non validi.");
  const found = findCut(await loadLeague(), input.cutId);
  if (!found || found.cut.status !== "pending") return fail("Taglio non trovato o già risolto. Aggiorna la pagina.");

  const db = await createClient();
  const { error } = await db.rpc("admin_finalize_cut", { p_cut_id: input.cutId, p_version: input.version });
  if (error) return rpcError(error.message);
  refresh();
  return done(`Taglio di ${found.cut.name} reso definitivo: ${found.team.team.name} continua a pagare ${found.cut.paid} crediti.`);
}

/** Il giocatore rientra nella squadra che lo aveva tagliato (la quota non si paga più). */
export async function reinstateCut(input: {
  cutId: number;
  version: number;
  slot: "starter" | "reserve";
  /** serve solo per i tagli importati dal foglio, che non ricordano lo stipendio di partenza */
  salary: number | null;
  years: number | null;
  teamOption: boolean;
}): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!isNum(input.cutId) || !isNum(input.version) || (input.slot !== "starter" && input.slot !== "reserve")) return fail("Dati non validi.");
  const league = await loadLeague();
  const found = findCut(league, input.cutId);
  if (!found || found.cut.status !== "pending") return fail("Taglio non trovato o già risolto. Aggiorna la pagina.");

  const salary = found.cut.originalSalary ?? input.salary;
  if (salary === null || !isNum(salary)) return fail("Indica lo stipendio con cui rientra: il taglio non lo ricorda.");
  // Rientrando, la quota del taglio sparisce dal monte ingaggi e lo stipendio pieno torna al suo posto.
  const side = { ...teamSide(found.team), cuts: found.team.cuts.filter((c) => c.id !== input.cutId).map((c) => ({ salary: c.paid })) };
  const ev = evaluateSigning(side, { slot: input.slot, years: input.years, teamOption: input.teamOption, salary, isRookie: found.cut.originalIsRookie, position: found.cut.pos }, league.settings);
  if (ev.errors.length) return fail(ev.errors.join(" "));

  const db = await createClient();
  const { error } = await db.rpc("admin_reinstate_cut", {
    p_cut_id: input.cutId,
    p_version: input.version,
    p_slot: input.slot,
    p_salary: salary,
    p_years: input.years,
    p_team_option: input.teamOption,
    p_roster_rev: (await loadVersions()).rosterRev[found.team.team.id] ?? null,
  });
  if (error) return rpcError(error.message);
  refresh();
  return done(`${found.cut.name} rientra in rosa a ${found.team.team.name} con ${salary} crediti.`, ev.warnings);
}

// ---------- Pick (R-33, R-34) ----------
export async function setPick(input: { pickId: number; version: number; teamId: string | null; toConfirm: boolean; note: string }): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!isNum(input.pickId) || !isNum(input.version)) return fail("Dati non validi.");
  const league = await loadLeague();
  const pick = league.picks.find((p) => p.id === input.pickId);
  if (!pick) return fail("Pick non trovata. Aggiorna la pagina.");
  if (input.teamId === null && !input.toConfirm) return fail("Una pick senza proprietario deve restare «da confermare».");
  if (input.teamId !== null && !league.teamNames.has(input.teamId)) return fail("Squadra non trovata.");

  const warnings = input.teamId
    ? pickLimitWarnings(
        league.teamNames.get(input.teamId) ?? "?",
        [...league.picks.filter((p) => p.id !== pick.id && p.current_team_id === input.teamId), pick],
        league.settings,
      )
    : [];
  const db = await createClient();
  const { error } = await db.rpc("admin_set_pick", {
    p_pick_id: input.pickId,
    p_version: input.version,
    p_current_team_id: input.teamId,
    p_to_confirm: input.toConfirm,
    p_note: input.note,
  });
  if (error) return rpcError(error.message);
  refresh();
  return done(`Pick ${pick.year} ${pick.round}° giro aggiornata.`, warnings);
}

/** R-34: si aprono solo i draft entro l'orizzonte di lega (a ottobre 2026: 2027-2029). */
export async function openPickYear(input: { year: number }): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  const league = await loadLeague();
  if (!pickYearAllowed(input.year, league.seasonYear, league.settings)) {
    return fail(`Si possono aprire solo i draft dal ${league.seasonYear + 1} al ${league.seasonYear + league.settings.pickHorizonYears} (R-34).`);
  }
  const db = await createClient();
  const { error } = await db.rpc("admin_open_pick_year", { p_year: input.year, p_rounds: league.settings.draftRounds });
  if (error) return rpcError(error.message);
  refresh();
  return done(`Pick del draft ${input.year} aperte: ${league.settings.draftRounds} giri per squadra, ognuna alla sua squadra.`);
}

// ---------- Chiusura stagione (R-60, R-32, R-23, R-24) ----------
/** Rilegge i dati dal database e ricalcola il piano: della pagina si fidano solo le scelte dell'admin. */
export async function closeSeason(choices: CloseChoices): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!SEASON_CLOSE_ENABLED) return fail("La chiusura di stagione non è ancora abilitata.");
  const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");
  if (!choices || !isStrings(choices.ranking) || !isStrings(choices.lottery) || !Array.isArray(choices.exercised) || !choices.exercised.every(isNum)) return fail("Dati non validi.");

  const [league, input] = await Promise.all([loadLeague(), loadCloseInput()]);
  const plan = planSeasonClose(input, choices, league.settings);
  if (plan.errors.length) return fail(plan.errors.join(" "));

  const db = await createClient();
  const { error } = await db.rpc("admin_close_season", {
    p_plan: {
      season_id: input.seasonId,
      new_year: plan.newYear,
      summary: plan.summary,
      teams: plan.teams.map((t) => ({ team_id: t.teamId, rank: t.rank, bonus: t.bonus, tax_eur: t.taxEur })),
      carry_contracts: plan.carryContracts.map((c) => ({ id: c.id, version: c.version, years_left: c.years, team_option: c.teamOption, restriction: c.restriction })),
      expire_contracts: plan.expireContracts.map((c) => ({ id: c.id, version: c.version, restricted: c.restricted })),
      carry_cuts: plan.carryCuts.map((c) => ({ id: c.id, version: c.version, years_left: c.years })),
      end_cuts: plan.endCuts,
      draft_order: plan.draftOrder.map((d) => ({ pick_no: d.pickNo, team_id: d.teamId, original_team_id: d.originalTeamId, note: d.note })),
    },
  });
  if (error) return rpcError(error.message);
  refresh();
  // R-34: con la stagione nuova rientra nell'orizzonte un altro draft, ma le pick non si aprono da sole.
  const nextDraft = plan.newYear + league.settings.pickHorizonYears;
  const open = league.picks.some((p) => p.year === nextDraft) ? "" : ` Apri in Pick il draft ${nextDraft}.`;
  return done(`Stagione ${input.seasonYear} chiusa: ora la stagione corrente è la ${plan.newYear}.${open}`, plan.warnings);
}

// ---------- Quota di iscrizione e luxury tax ----------
/** `version` null = la squadra non ha ancora una riga di quote (la RPC la crea). */
export async function setTeamSeason(input: { teamId: string; version: number | null; entryFeePaid: boolean; luxuryTaxPaid: boolean }): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  const league = await loadLeague();
  const team = league.teams.find((t) => t.team.id === input.teamId);
  if (!team) return fail("Squadra non trovata.");
  const db = await createClient();
  const { error } = await db.rpc("admin_set_team_season", { p_team_id: input.teamId, p_version: input.version, p_entry_fee_paid: input.entryFeePaid, p_luxury_tax_paid: input.luxuryTaxPaid });
  if (error) return rpcError(error.message);
  refresh();
  return done(`${team.team.name} aggiornata.`);
}

// ---------- Dati Dunkest (issue #68) ----------
/** "Aggiorna ora": lo stesso aggiornamento del cron delle 9, con la sessione admin al posto del segreto del job. */
export async function syncDunkest(): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  const db = await createClient();
  // Le due parti sono indipendenti: un token scaduto non deve fermare statistiche e infortuni, e viceversa.
  const r = await runDunkestSync(db, null);
  const l = await runDunkestLeagueSync(db, null, process.env.DUNKEST_TOKEN);
  refresh();
  const leagueLine = l.ok
    ? `classifica e ${l.matches} scontri aggiornati${l.lineups ? `, ${l.lineups} giocatori schierati` : ""}`
    : l.code === "token_rejected"
      ? "Dunkest ha rifiutato il token: va rinnovato (classifica e formazioni restano quelle di prima)."
      : l.code === "token_missing"
        ? "DUNKEST_TOKEN non impostato: classifica e formazioni non si aggiornano."
        : `Classifica e formazioni non aggiornate: ${l.error}.`;
  if (!r.ok && !l.ok) return fail(`Aggiornamento non riuscito: ${r.error}. ${leagueLine} Restano i dati di prima.`);
  const warnings: string[] = [];
  if (!r.ok) warnings.push(`Statistiche e infortuni non aggiornati: ${r.error}. Restano quelli di prima.`);
  if (!l.ok) warnings.push(leagueLine);
  const unlinked = (r.ok ? r.report.ambiguous.length + r.report.rosteredWithoutStats.length : 0) + (l.ok ? l.report.unlinked.length + l.report.ambiguous.length : 0);
  if (unlinked > 0) warnings.push(`${unlinked} giocatori da controllare nel report.`);
  const parts = [r.ok && `${r.stats} giocatori con statistiche, ${r.injuries} infortunati`, l.ok && leagueLine].filter(Boolean);
  return done(`Dati Dunkest aggiornati: ${parts.join("; ")}.`, warnings);
}

// ---------- Allineamento titolari ↔ riserve alla rosa Dunkest (issue #72) ----------
/**
 * Per ogni squadra indicata: chi è nella rosa Dunkest diventa titolare, i titolari che non ci sono diventano riserve. Lo stesso
 * calcolo della proposta in /admin/dunkest, rifatto qui sui dati di adesso. Una transazione per squadra (`admin_swap_slots`);
 * squadre bloccate (giocatori non collegati o di altre squadre) restano com'erano. Cap e riserve sforati sono avvisi.
 */
export async function alignToDunkest(teamIds: string[]): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return fail(denied);
  if (!Array.isArray(teamIds) || teamIds.length === 0 || teamIds.some((id) => typeof id !== "string")) return fail("Dati non validi.");
  const [league, versions, rosters] = await Promise.all([loadLeague(), loadVersions(), loadDunkestRosters()]);
  const db = await createClient();
  const doneTeams: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const teamId of teamIds) {
    const name = league.teamNames.get(teamId) ?? "?";
    const a = teamAlignment(league, teamId, rosters);
    if (!a) {
      errors.push(`${name}: rosa Dunkest non disponibile.`);
      continue;
    }
    if (a.blockers.length) {
      errors.push(`${name}: ${a.blockers.join(" ")}`);
      continue;
    }
    if (a.promote.length === 0) continue;
    const items = [
      ...a.promote.map((c) => ({ id: c.contractId, version: versions.contracts[c.contractId], slot: "starter" })),
      ...a.demote.map((c) => ({ id: c.contractId, version: versions.contracts[c.contractId], slot: "reserve" })),
    ];
    const { error } = await db.rpc("admin_swap_slots", { p_team_id: teamId, p_roster_rev: versions.rosterRev[teamId] ?? null, p_items: items });
    if (error) {
      const r = rpcError(error.message);
      errors.push(`${name}: ${r.ok ? error.message : r.error}`);
      continue;
    }
    doneTeams.push(`${name} (${a.promote.map((c) => c.name.split(" ").at(-1)).join(", ")} titolari)`);
    warnings.push(...a.warnings.map((w) => `${name}: ${w}`));
  }
  refresh();
  if (doneTeams.length === 0) return fail(errors.length ? errors.join(" ") : "Niente da allineare: titolari e riserve coincidono già con Dunkest.");
  return done(`Allineate a Dunkest: ${doneTeams.join("; ")}.`, [...warnings, ...errors]);
}
