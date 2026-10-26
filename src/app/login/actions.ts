"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/next-path";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  info?: string;
}

export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Inserisci email e password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email o password non corrette." };
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

/** Link di accesso via email. Gli utenti li crea l'admin: signup pubblico disattivato (shouldCreateUser: false). */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Inserisci la tua email." };
  // Indirizzo fisso da configurazione; Origin/Host solo come ripiego in sviluppo locale.
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || (h.get("origin") ?? `http://${h.get("host")}`);
  const next = safeNextPath(String(form.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}` },
  });
  if (error) return { error: "Impossibile inviare il link. Controlla l'email o chiedi a un admin." };
  return { info: "Se l'email è registrata, riceverai un link di accesso." };
}
