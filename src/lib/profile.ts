export type Profile = { email: string; display_name: string; role: "admin" | "viewer"; team_id: string | null };
type ProfileRow = Omit<Profile, "email">;

/**
 * Profilo dalla riga letta: riga assente = viewer senza squadra (fallback voluto, i permessi veri sono in RLS).
 * Un errore della query invece non è "profilo assente": si lancia, così l'utente vede un problema di disponibilità
 * e non un admin trattato da viewer (404 sull'area admin).
 */
export function resolveProfile(email: string, row: ProfileRow | null, error: { message: string } | null): Profile {
  if (error) throw new Error(`Profilo non disponibile: ${error.message}`);
  return { email, ...(row ?? { display_name: email, role: "viewer" as const, team_id: null }) };
}
