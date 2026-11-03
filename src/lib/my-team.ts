import { loadProfile } from "./league-server";

/** Squadra dell'utente loggato, o il motivo per cui non può agire (per le action dei proprietari: scambi, cambi titolari/riserve). */
export async function myTeam(): Promise<{ teamId: string } | { error: string }> {
  try {
    const profile = await loadProfile();
    return profile?.team_id ? { teamId: profile.team_id } : { error: "Serve un account collegato a una squadra: chiedi a un admin." };
  } catch {
    return { error: "Profilo non disponibile al momento: riprova tra poco. Non è stato salvato nulla." };
  }
}
