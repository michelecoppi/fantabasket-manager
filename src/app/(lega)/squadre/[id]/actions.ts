"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { done, fail, isNum, rpcError, type ActionResult } from "@/lib/action-result";
import { loadLeague, loadSlotSwapWindow, loadVersions } from "@/lib/league-server";
import { myTeam } from "@/lib/my-team";
import { evaluateSlotSwapItems, slotSwapLabel, slotSwapLines, type SwapSlot } from "@/lib/slot-swap";
import { slotSwapAlertText } from "@/lib/slot-swap-announce";
import { createClient } from "@/lib/supabase/server";
import { alertAdminsQuietly } from "@/lib/telegram";

/**
 * Action del proprietario sui cambi titolari ↔ riserve (R-04, docs/product/PIANO-CAMBI-RISERVE.md). Scrittura dei viewer: passa
 * solo dalle RPC `slot_swap_*`, che controllano la squadra di chi chiama; qui si controllano le regole con `evaluateSlotSwap`.
 */

const refresh = () => revalidatePath("/", "layout");

export async function requestSlotSwap(input: { teamId: string; moves: { id: number; slot: SwapSlot }[] }): Promise<ActionResult> {
  const me = await myTeam();
  if ("error" in me) return fail(me.error);
  if (input.teamId !== me.teamId) return fail("Puoi chiedere cambi solo per la tua squadra.");
  if (!Array.isArray(input.moves) || input.moves.some((m) => !isNum(m?.id) || (m.slot !== "starter" && m.slot !== "reserve"))) return fail("Dati non validi.");
  if ((await loadSlotSwapWindow()) === false) return fail("I cambi tra titolari e riserve sono chiusi: si aprono nella data stabilita da un admin (R-04).");

  const [league, versions] = await Promise.all([loadLeague(), loadVersions()]);
  const items = input.moves.map((m) => ({ id: m.id, slot: m.slot, version: versions.contracts[m.id] ?? 0 }));
  const check = evaluateSlotSwapItems(league, me.teamId, items);
  if (!check) return fail("Squadra non trovata.");
  if (check.stale.length) return fail("Un giocatore non è più nella tua rosa. Aggiorna la pagina (pulsante in alto) e riprova.");
  if (check.ev.errors.length) return fail(check.ev.errors.join(" "));

  const db = await createClient();
  const { error } = await db.rpc("slot_swap_request", {
    p_team_id: me.teamId,
    p_roster_rev: versions.rosterRev[me.teamId] ?? null,
    p_items: items.map((i) => ({ ...i, label: slotSwapLabel(league, me.teamId, i.id) })),
  });
  if (error) return rpcError(error.message);
  refresh();
  // Avviso privato agli admin di TELEGRAM_ADMIN_ALERT, a risposta già inviata (senza id o senza token non parte).
  const { up, down } = slotSwapLines(league, me.teamId, items);
  const players = [...up, ...down].map((l) => ({ name: l.name, pos: l.pos, salary: l.salary, slot: l.slot }));
  const alert = slotSwapAlertText(league.teamNames.get(me.teamId) ?? "?", players, check.ev.warnings, process.env.NEXT_PUBLIC_SITE_URL);
  after(() => alertAdminsQuietly(alert));
  return done("Richiesta inviata: un admin la fa su Dunkest e poi la approva qui.", check.ev.warnings);
}

export async function withdrawSlotSwap(input: { id: number; version: number }): Promise<ActionResult> {
  const me = await myTeam();
  if ("error" in me) return fail(me.error);
  if (!isNum(input.id) || !isNum(input.version)) return fail("Dati non validi.");
  const db = await createClient();
  const { error } = await db.rpc("slot_swap_withdraw", { p_id: input.id, p_version: input.version });
  if (error) return rpcError(error.message);
  refresh();
  return done("Richiesta ritirata.");
}
