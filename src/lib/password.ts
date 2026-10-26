export const MIN_PASSWORD_LENGTH = 8;

/** Controlli sulla nuova password prima di mandarla a Supabase Auth. Restituisce il primo errore, o null se va bene. */
export function passwordError(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  if (password.length > 72) return "La password può avere al massimo 72 caratteri.";
  if (password !== confirm) return "Le due password non coincidono.";
  return null;
}
