"use server";

import { revalidatePath } from "next/cache";
import { done, fail, isNum, rpcError, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * Rivelazione del sorteggio vista (issue #103): la RPC segna l'utente che chiama, una volta. È l'unica scrittura dei viewer
 * oltre alle proposte di scambio e riguarda solo il loro flag.
 */
export async function markLotterySeen(seasonId: number): Promise<ActionResult> {
  if (!isNum(seasonId)) return fail("Dati non validi.");
  const db = await createClient();
  const { error } = await db.rpc("draft_lottery_seen", { p_season_id: seasonId });
  if (error) return rpcError(error.message);
  revalidatePath("/", "layout");
  return done("Sorteggio visto.");
}
