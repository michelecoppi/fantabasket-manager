"use server";

import { passwordError } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

export interface PasswordState {
  error?: string;
  done?: boolean;
}

/** Imposta o cambia la password dell'utente loggato (anche chi è entrato col link email). */
export async function updatePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const invalid = passwordError(password, confirm);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Sessione scaduta: accedi di nuovo." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "La nuova password è uguale a quella attuale." };
    if (error.code === "weak_password") return { error: "Password troppo debole: scegline una più lunga o meno comune." };
    if (error.code === "reauthentication_needed") return { error: "Per sicurezza esci e rientra col link email, poi riprova." };
    return { error: "Impossibile salvare la password. Riprova tra poco." };
  }
  return { done: true };
}
